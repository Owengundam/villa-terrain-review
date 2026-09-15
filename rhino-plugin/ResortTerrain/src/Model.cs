using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace Field.ResortTerrain
{
 public sealed class Settings
 {
  public double ConeDegrees {get;set;}=120;
  public double RequiredDrop {get;set;}=5;
  public double Margin {get;set;}=.25;
  public double MaxLevelChange {get;set;}=3;
  public double MaxRotation {get;set;}=20;
  public double MaxMove {get;set;}=6;
  public double MaxSlopePercent {get;set;}=100;
  public double GridSpacing {get;set;}=1.25;
  public double ContourInterval {get;set;}=2;
  public double MinimumClearance {get;set;}=3;
  public bool AdjustLayout {get;set;}=true;
  public bool AutoSave {get;set;}=true;
  public string Scope {get;set;}="All options";
  public void Validate()
  {
   double[] all={ConeDegrees,RequiredDrop,Margin,MaxLevelChange,MaxRotation,MaxMove,MaxSlopePercent,GridSpacing,ContourInterval,MinimumClearance};
   if(all.Any(x=>!double.IsFinite(x)))throw new Exception("Enter finite numbers for every setting.");
   if(ConeDegrees<10||ConeDegrees>170||RequiredDrop<0||Margin<0||MaxLevelChange<0||MaxLevelChange>50||MaxRotation<0||MaxRotation>60||MaxMove<0||MaxMove>30||MaxSlopePercent<1||MaxSlopePercent>1000||GridSpacing<.5||GridSpacing>5||ContourInterval<.25||ContourInterval>10||MinimumClearance<0)throw new Exception("One or more settings are outside the allowed range.");
  }
  public Settings Copy()=>JsonSerializer.Deserialize<Settings>(JsonSerializer.Serialize(this));
 }
 public sealed class Binding
 {
  public double[] Matrix {get;set;}
  public double[][] Footprint {get;set;}
  public double[] View {get;set;}
 }
 public sealed class Unit
 {
  public Guid Id; public string Name; public Point3d[] Points; public Vector3d View;
  public Transform CurrentTransform,ReferenceTransform; public Point3d[] ReferencePoints;
  public Point3d Center=>new Point3d(Points.Average(p=>p.X),Points.Average(p=>p.Y),Points.Average(p=>p.Z));
  public double Ground=>Points.Average(p=>p.Z)-.08;
  public Vector3d Side=>new Vector3d(View.Y,-View.X,0);
  public Unit Clone()=>new Unit{Id=Id,Name=Name,Points=Points.ToArray(),View=View,CurrentTransform=CurrentTransform,ReferenceTransform=ReferenceTransform,ReferencePoints=ReferencePoints.ToArray()};
  public void Move(double angle,double dx,double dy,double dz)
  {
   var xf=Transform.Translation(dx,dy,dz)*Transform.Rotation(angle*Math.PI/180,Vector3d.ZAxis,Center);
   for(int i=0;i<Points.Length;i++)Points[i].Transform(xf);
   View.Transform(xf);View.Z=0;View.Unitize();CurrentTransform=xf*CurrentTransform;
  }
  public PolylineCurve Outline()=>new PolylineCurve(Points.Concat(new[]{Points[0]}).Select(p=>new Point3d(p.X,p.Y,0)));
  public static double[] Matrix(Transform t){var a=new double[16];for(int i=0;i<4;i++)for(int j=0;j<4;j++)a[i*4+j]=t[i,j];return a;}
  public static Transform Matrix(double[] a){var t=Transform.Identity;for(int i=0;i<4;i++)for(int j=0;j<4;j++)t[i,j]=a[i*4+j];return t;}
 }
 public sealed class Study
 {
  public string Prefix,Name; public Curve Boundary; public int TerrainLayer,ContourLayer,BoundaryLayer;
  public List<RhinoObject> Objects; public List<Unit> Units;
  public List<Unit> CopyUnits()=>Units.Select(u=>u.Clone()).ToList();
 }
 public sealed class Link
 {
  public int Viewer,Front; public bool Nearest,Axial; public double Drop;
 }
 public static class Model
 {
  public const string BindingKey="Field.ResortTerrain.Binding.v1";
  public static List<Study> Read(RhinoDoc doc,string scope,bool ignoreBindings=false)
  {
   if(doc.ModelUnitSystem!=UnitSystem.Meters)throw new Exception("This version requires model units in metres. Convert the model units before running it.");
   var modules=doc.Objects.Where(o=>o is InstanceObject&&!string.IsNullOrEmpty(o.Attributes.GetUserString("Function"))).ToList();
   var groups=modules.GroupBy(o=>doc.Layers[o.Attributes.LayerIndex].FullPath.Substring(0,doc.Layers[o.Attributes.LayerIndex].FullPath.LastIndexOf("::",StringComparison.Ordinal)+2));
   var result=new List<Study>();
   foreach(var group in groups)
   {
    string prefix=group.Key;if(string.IsNullOrEmpty(prefix))continue;
    var name=prefix.TrimEnd(':').Split(new[]{"::"},StringSplitOptions.None).Last();if(scope!="All options"&&scope!=name)continue;
    var objects=doc.Objects.Where(o=>doc.Layers[o.Attributes.LayerIndex].FullPath.StartsWith(prefix,StringComparison.Ordinal)).ToList();
    var boundary=objects.FirstOrDefault(o=>(o.Name=="Original TRACE_01_REDLINE"||o.Name=="RT_BOUNDARY")&&doc.Layers[o.Attributes.LayerIndex].FullPath.EndsWith("01_BOUNDARY",StringComparison.Ordinal));
    if(!(boundary?.Geometry is Curve curve)||!curve.IsClosed)throw new Exception(name+": a closed boundary on 01_BOUNDARY is required.");
    var study=new Study{Prefix=prefix,Name=name,Objects=objects,Boundary=curve.DuplicateCurve(),BoundaryLayer=boundary.Attributes.LayerIndex,TerrainLayer=doc.Layers.FindByFullPath(prefix+"03_TERRAIN",-1),ContourLayer=doc.Layers.FindByFullPath(prefix+"04_CONTOURS",-1),Units=new List<Unit>()};
    if(study.TerrainLayer<0||study.ContourLayer<0)throw new Exception(name+": terrain and contour layers are missing.");
    foreach(InstanceObject module in group)
    {
     var fill=objects.FirstOrDefault(o=>o.Name==module.Name+" footprint fill");
     if(!(fill?.Geometry is Mesh m)||m.Vertices.Count!=4)throw new Exception(module.Name+": a four-corner footprint fill is required.");
     Point3d[] pts=m.Vertices.Select(v=>new Point3d(v.X,v.Y,v.Z)).ToArray();
     var arrow=objects.Where(o=>o.Name==module.Name+" main view"&&o.Geometry is Curve).OrderByDescending(o=>((Curve)o.Geometry).GetLength()).FirstOrDefault();
     if(arrow==null)throw new Exception(module.Name+": a main-view arrow is required.");
     Vector3d view=((Curve)arrow.Geometry).PointAtEnd-((Curve)arrow.Geometry).PointAtStart;view.Z=0;if(!view.Unitize())throw new Exception("Invalid view arrow: "+module.Name);
     var reference=module.InstanceXform;var refPoints=pts.ToArray();
     string saved=ignoreBindings?null:module.Attributes.GetUserString(BindingKey);
     if(!string.IsNullOrEmpty(saved))
     {
      var actualView=view;var b=JsonSerializer.Deserialize<Binding>(saved);reference=Unit.Matrix(b.Matrix);refPoints=b.Footprint.Select(p=>new Point3d(p[0],p[1],p[2])).ToArray();
      if(!reference.TryGetInverse(out Transform inv))throw new Exception("Invalid stored building transform.");
      var delta=module.InstanceXform*inv;pts=refPoints.Select(p=>{p.Transform(delta);return p;}).ToArray();view=new Vector3d(b.View[0],b.View[1],0);view.Transform(delta);view.Z=0;view.Unitize();
      var referenceView=new Vector3d(b.View[0],b.View[1],0);if((actualView-view).Length>.001&&(actualView-referenceView).Length>.001)view=actualView;
      // Linked geometry may have moved with a group, or may still be at its last bound position.
      var actual=m.Vertices.Select(v=>new Point3d(v.X,v.Y,v.Z)).ToArray();
      bool atCurrent=actual.Zip(pts,(a,bp)=>a.DistanceTo(bp)).Max()<.03;
      bool atReference=actual.Zip(refPoints,(a,bp)=>a.DistanceTo(bp)).Max()<.03;
      if(!atCurrent&&!atReference)throw new Exception(module.Name+": footprint was edited independently. Rebind it after aligning the block, fill and arrow.");
     }
     var unit=new Unit{Id=module.Id,Name=module.Name,Points=pts,View=view,CurrentTransform=module.InstanceXform,ReferenceTransform=reference,ReferencePoints=refPoints};
     var scale=module.InstanceXform;var x=new Vector3d(scale.M00,scale.M10,scale.M20);var y=new Vector3d(scale.M01,scale.M11,scale.M21);
     if(Math.Abs(x.Length-1)>.001||Math.Abs(y.Length-1)>.001||Math.Abs(x.Z)>.001||Math.Abs(y.Z)>.001)throw new Exception(module.Name+": scaled or tilted building blocks are not supported.");
     var edge1=pts[1]-pts[0];var edge2=pts[3]-pts[0];if(edge1.Length<.1||edge2.Length<.1||Math.Abs(edge1*edge2)/(edge1.Length*edge2.Length)>.001||(pts[2]-(pts[0]+edge1+edge2)).Length>.02)throw new Exception(module.Name+": footprint must be a rectangle.");
     if(pts.Max(p=>p.Z)-pts.Min(p=>p.Z)>.01)throw new Exception(module.Name+": footprint must be level.");
     if(!string.IsNullOrEmpty(saved)||module.Geometry.GetBoundingBox(true).Center.DistanceTo(unit.Center)<1){}else throw new Exception(module.Name+": align its footprint with the block before first binding.");
     study.Units.Add(unit);
    }
    if(study.Units.Select(u=>u.Name).Distinct().Count()!=study.Units.Count)throw new Exception(name+": building names must be unique.");
    result.Add(study);
   }
   if(result.Count==0)throw new Exception("No supported study found. Use the existing resort option layers, building Function tags, footprint fills and main-view arrows.");
   return result;
  }
  public static Point3d Anchor(GeometryBase geometry)
  {
   if(geometry is Mesh mesh)return (Point3d)mesh.Vertices[0];
   if(geometry is Curve curve)return curve.PointAtStart;
   if(geometry is TextEntity text)return text.Plane.Origin;
   return geometry.GetBoundingBox(true).Center;
  }
  public static void Bind(RhinoDoc doc,IEnumerable<Study> studies)
  {
   foreach(var study in studies)foreach(var u in study.Units)
   {
    var obj=doc.Objects.FindId(u.Id);var a=obj.Attributes.Duplicate();
    a.SetUserString(BindingKey,JsonSerializer.Serialize(new Binding{Matrix=Unit.Matrix(u.CurrentTransform),Footprint=u.Points.Select(p=>new[]{p.X,p.Y,p.Z}).ToArray(),View=new[]{u.View.X,u.View.Y}}));
    if(!doc.Objects.ModifyAttributes(obj.Id,a,true))throw new Exception("Could not bind "+u.Name);
    foreach(var linked in study.Objects.Where(o=>o.Name==u.Name+" footprint fill"||o.Name==u.Name+" private garden"||o.Name==u.Name+" terrace strip"||o.Name==u.Name+" main view"))
    {var anchor=Anchor(linked.Geometry);var la=linked.Attributes.Duplicate();la.SetUserString("Field.ResortTerrain.Anchor",JsonSerializer.Serialize(new[]{anchor.X,anchor.Y,anchor.Z}));if(!doc.Objects.ModifyAttributes(linked.Id,la,true))throw new Exception("Could not track "+linked.Name);}
   }
  }
 }
 public static class Visibility
 {
  struct P {public double X,Y;public P(double x,double y){X=x;Y=y;}}
  static List<P> Clip(List<P> p,double a,double b,double k)
  {
   var q=new List<P>();for(int i=0;i<p.Count;i++){var x=p[(i+p.Count-1)%p.Count];var y=p[i];double fx=a*x.X+b*x.Y-k,fy=a*y.X+b*y.Y-k;bool ix=fx>=-1e-8,iy=fy>=-1e-8;if(ix!=iy){double t=fx/(fx-fy);q.Add(new P(x.X+t*(y.X-x.X),x.Y+t*(y.Y-x.Y)));}if(iy)q.Add(y);}return q;
  }
  static double Area(List<P> p){double a=0;for(int i=0;i<p.Count;i++){var q=p[(i+p.Count-1)%p.Count];a+=q.X*p[i].Y-p[i].X*q.Y;}return Math.Abs(a)/2;}
  static double Distance(List<P> p){double best=double.MaxValue;for(int i=0;i<p.Count;i++){var a=p[(i+p.Count-1)%p.Count];var b=p[i];double dx=b.X-a.X,dy=b.Y-a.Y,den=dx*dx+dy*dy,t=den<1e-16?0:Math.Clamp(-(a.X*dx+a.Y*dy)/den,0,1);best=Math.Min(best,Math.Sqrt(Math.Pow(a.X+t*dx,2)+Math.Pow(a.Y+t*dy,2)));}return best;}
  public static List<Link> Audit(IList<Unit> units,Settings s)
  {
   var links=new List<Link>();double tan=Math.Tan(s.ConeDegrees*Math.PI/360);
   for(int i=0;i<units.Count;i++)
   {
    var u=units[i];var c=u.Center;var side=u.Side;double left=u.Points.Min(p=>(p-c)*side),right=u.Points.Max(p=>(p-c)*side),front=u.Points.Max(p=>(p-c)*u.View);var origin=c+front*u.View;
    int nearest=-1;double nearDistance=double.MaxValue;var axial=new HashSet<int>();
    for(int j=0;j<units.Count;j++)if(i!=j)
    {
     var poly=units[j].Points.Select(p=>new P((p-origin)*side,(p-origin)*u.View)).ToList();
     var cone=Clip(Clip(Clip(poly,0,1,0),1,tan,0),-1,tan,0);
     if(Area(cone)>1e-7){double d=Distance(poly);if(d<nearDistance-1e-8||(Math.Abs(d-nearDistance)<1e-8&&(nearest<0||string.CompareOrdinal(units[j].Name,units[nearest].Name)<0))){nearDistance=d;nearest=j;}}
     if(Area(Clip(Clip(Clip(poly,0,1,0),1,0,left),-1,0,-right))>1e-7)axial.Add(j);
    }
    var all=new HashSet<int>(axial);if(nearest>=0)all.Add(nearest);
    foreach(int j in all.OrderBy(x=>x))links.Add(new Link{Viewer=i,Front=j,Nearest=j==nearest,Axial=axial.Contains(j),Drop=u.Ground-units[j].Ground});
   }
   return links;
  }
  public static bool ValidPlacement(Unit u,IEnumerable<Unit> others,Curve boundary,double clearance)
  {
   using(var poly=u.Outline())
   {
    foreach(double t in poly.DivideByLength(.75,true)??Array.Empty<double>())if(boundary.Contains(poly.PointAt(t),Plane.WorldXY,.001)!=PointContainment.Inside)return false;
    foreach(var other in others)using(var q=other.Outline())
    {
     if(Curve.PlanarClosedCurveRelationship(poly,q,Plane.WorldXY,.001)!=RegionContainment.Disjoint)return false;
     if(!poly.ClosestPoints(q,out Point3d a,out Point3d b)||a.DistanceTo(b)<clearance-.001)return false;
    }
   }return true;
  }
 }
}
