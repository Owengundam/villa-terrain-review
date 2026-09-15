using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;
using Rhino.Display;

namespace Field.ResortTerrain
{
 public enum RunMode {Check,Preview,Update}
 public sealed class OptionReport
 {
  public string Option {get;set;} public int Buildings {get;set;} public int Relationships {get;set;} public int Failures {get;set;}
  public double MinimumDrop {get;set;} public double MaximumSlopePercent {get;set;} public double ContactError {get;set;}
  public bool CachedTriangulation {get;set;} public bool Unchanged {get;set;} public List<string> Changes {get;set;}=new List<string>();
 }
 public sealed class Report
 {
  public string Mode {get;set;} public bool Applied {get;set;} public string Backup {get;set;} public string SavedPath {get;set;} public double Seconds {get;set;}
  public List<string> Issues {get;set;}=new List<string>();public List<OptionReport> Options {get;set;}=new List<OptionReport>();
  public string Text()
  {
   var b=new StringBuilder("FIELD / Resort Terrain\n\n");b.AppendLine(Applied?"Update completed.":Issues.Count>0?"Review required — no update applied.":Mode=="Check"?"Check completed.":"Preview completed — no geometry changed.");
   b.AppendLine("Front = nearest building in the viewing cone + every building in the forward facade-width corridor.\n");
   foreach(var r in Options){b.AppendLine(r.Option+": "+r.Buildings+" buildings; "+r.Relationships+" front relationships; "+r.Failures+" failures.");b.AppendLine("Minimum drop: "+r.MinimumDrop.ToString("0.00")+" m. Maximum terrain slope: "+r.MaximumSlopePercent.ToString("0.0")+"%.");if(r.Unchanged)b.AppendLine("Unchanged option skipped.");foreach(var c in r.Changes)b.AppendLine("  "+c);b.AppendLine();}
   foreach(var issue in Issues)b.AppendLine("• "+issue);
   if(!string.IsNullOrEmpty(Backup))b.AppendLine("\nBackup: "+Backup);if(!string.IsNullOrEmpty(SavedPath))b.AppendLine("Saved: "+SavedPath);
   b.AppendLine("\nElapsed: "+Seconds.ToString("0.0")+" seconds.\nConcept grading only. Drainage, retaining structures and road gradients are not designed by this plugin.");return b.ToString();
  }
 }
 public sealed class Overlay:DisplayConduit
 {
  public uint Serial;public List<Polyline> Outlines=new List<Polyline>();public List<Point3d> Points=new List<Point3d>();
  protected override void DrawForeground(DrawEventArgs e){if(e.RhinoDoc.RuntimeSerialNumber!=Serial)return;foreach(var p in Outlines)e.Display.DrawPolyline(p,Color.IndianRed,3);foreach(var p in Points)e.Display.DrawPoint(p,PointStyle.RoundSimple,4,Color.DarkOrange);}
  public static Overlay Current;
  public static void Clear(){if(Current!=null){Current.Enabled=false;Current=null;}}
 }
 public static class Workflow
 {
  const string FingerprintKey="Field.ResortTerrain.Fingerprint.v1";
  public static string Fingerprint(Study s,List<Unit> units,Settings settings)=>Terrain.Hash(Terrain.Key(s,units,settings.GridSpacing)+string.Join(";",units.Select(u=>u.Ground.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+","+u.View.X.ToString("R",System.Globalization.CultureInfo.InvariantCulture)+","+u.View.Y.ToString("R",System.Globalization.CultureInfo.InvariantCulture)))+settings.ContourInterval.ToString("R",System.Globalization.CultureInfo.InvariantCulture));
  static string DerivedCRC(Study study,RhinoDoc doc)=>Terrain.Hash(string.Join(";",study.Objects.Where(o=>doc.Layers[o.Attributes.LayerIndex].FullPath==study.Prefix+"04_CONTOURS"||o.Name=="Site boundary draped on concept terrain").Select(o=>o.Geometry.DataCRC(0).ToString()).OrderBy(x=>x)));
  static void CheckGeometry(Study study,List<Unit> units,Settings settings,List<string> issues)
  {
   for(int i=0;i<units.Count;i++)
   {
    using(var outline=units[i].Outline())
    {
     if((outline.DivideByLength(.75,true)??Array.Empty<double>()).Any(t=>study.Boundary.Contains(outline.PointAt(t),Plane.WorldXY,.001)!=PointContainment.Inside))issues.Add(study.Name+": "+units[i].Name+" extends outside the site boundary.");
     for(int j=0;j<i;j++)using(var other=units[j].Outline())
     {
      bool overlap=Curve.PlanarClosedCurveRelationship(outline,other,Plane.WorldXY,.001)!=RegionContainment.Disjoint;
      outline.ClosestPoints(other,out Point3d a,out Point3d b);double gap=overlap?0:a.DistanceTo(b);
      if(gap<settings.MinimumClearance-.001)issues.Add(study.Name+": "+units[i].Name+" / "+units[j].Name+" have "+gap.ToString("0.00")+" m clearance (limit "+settings.MinimumClearance.ToString("0.00")+" m).");
     }
    }
   }
  }
  static double ExistingSlope(Study study,List<Point3d> steep,double limit)
  {
   double max=0;foreach(var obj in study.Objects.Where(o=>o.Name=="CONCEPT_TERRAIN_NOT_SURVEYED"))if(obj.Geometry is Mesh m)
   for(int i=0;i<m.Faces.Count;i++){var face=m.Faces[i];var a=(Point3d)m.Vertices[face.A];var b=(Point3d)m.Vertices[face.B];var c=(Point3d)m.Vertices[face.C];var n=Vector3d.CrossProduct(b-a,c-a);if(n.Length<1e-8)continue;double slope=100*Math.Sqrt(n.X*n.X+n.Y*n.Y)/Math.Max(1e-10,Math.Abs(n.Z));max=Math.Max(max,slope);if(slope>limit&&steep.Count<200)steep.Add(m.Faces.GetFaceCenter(i));}return max;
  }
  static ObjectAttributes Attr(int layer,string name){var a=new ObjectAttributes{LayerIndex=layer,Name=name};a.SetUserString("Study","Concept terrain - not surveyed");a.SetUserString("GeneratedBy","FIELD Resort Terrain 1.0");return a;}
  public static Report Execute(RhinoDoc doc,Settings settings,RunMode mode,Work work,bool showOverlay=true)
  {
   settings.Validate();var watch=Stopwatch.StartNew();var report=new Report{Mode=mode.ToString()};var studies=Model.Read(doc,settings.Scope);var proposed=new List<(Study Study,List<Unit> Units,SurfaceResult Surface)>();var overlay=new Overlay{Serial=doc.RuntimeSerialNumber};
   foreach(var study in studies)
   {
    work.Pulse();var units=mode==RunMode.Check?study.CopyUnits():LayoutSolver.Fit(study,settings,work,report.Issues);var links=Visibility.Audit(units,settings);var row=new OptionReport{Option=study.Name,Buildings=units.Count,Relationships=links.Count,Failures=links.Count(l=>l.Drop<settings.RequiredDrop-1e-5),MinimumDrop=links.Count==0?0:links.Min(l=>l.Drop)};report.Options.Add(row);
    foreach(var l in links.Where(l=>l.Drop<settings.RequiredDrop-1e-5)){report.Issues.Add(study.Name+": "+units[l.Viewer].Name+" → "+units[l.Front].Name+": "+l.Drop.ToString("0.00")+" m front drop.");overlay.Outlines.Add(new Polyline(units[l.Viewer].Points.Concat(new[]{units[l.Viewer].Points[0]})));}
    CheckGeometry(study,units,settings,report.Issues);
    for(int i=0;i<units.Count;i++){var old=study.Units[i];var u=units[i];double dz=u.Ground-old.Ground,move=new Vector3d(u.Center.X-old.Center.X,u.Center.Y-old.Center.Y,0).Length;double angle=Math.Atan2(old.View.X*u.View.Y-old.View.Y*u.View.X,old.View*u.View)*180/Math.PI;if(Math.Abs(dz)+move+Math.Abs(angle)>.001)row.Changes.Add(u.Name+": level "+dz.ToString("+0.00;-0.00;0")+" m, move "+move.ToString("0.00")+" m, rotation "+angle.ToString("0.0")+"°.");}
    if(mode==RunMode.Check){row.MaximumSlopePercent=ExistingSlope(study,overlay.Points,settings.MaxSlopePercent);if(row.MaximumSlopePercent>settings.MaxSlopePercent)report.Issues.Add(study.Name+": existing terrain reaches "+row.MaximumSlopePercent.ToString("0.0")+"% slope (limit "+settings.MaxSlopePercent+"%). Orange points mark steep areas.");continue;}
    string key=Fingerprint(study,units,settings);var existing=study.Objects.FirstOrDefault(o=>o.Name=="CONCEPT_TERRAIN_NOT_SURVEYED");
    if(existing?.Attributes.GetUserString(FingerprintKey)==key&&existing.Attributes.GetUserString("Field.ResortTerrain.MeshCRC")==existing.Geometry.DataCRC(0).ToString()&&existing.Attributes.GetUserString("Field.ResortTerrain.DerivedCRC")==DerivedCRC(study,doc))
    {row.Unchanged=true;row.MaximumSlopePercent=ExistingSlope(study,overlay.Points,settings.MaxSlopePercent);if(row.MaximumSlopePercent>settings.MaxSlopePercent)report.Issues.Add(study.Name+": existing terrain exceeds the slope limit.");continue;}
    // Do not spend time rebuilding a surface for a layout which is already infeasible.
    if(report.Issues.Count>0)continue;
    double step=mode==RunMode.Preview?Math.Max(2.5,settings.GridSpacing):settings.GridSpacing;
    var field=GroundSolver.Build(study,units,step,work);var surface=Terrain.Build(study,units,field,settings,work);row.MaximumSlopePercent=surface.MaxSlope;row.ContactError=surface.ContactError;row.CachedTriangulation=surface.CacheHit;overlay.Points.AddRange(surface.SteepPoints);
    if(surface.MaxSlope>settings.MaxSlopePercent)report.Issues.Add(study.Name+": proposed terrain reaches "+surface.MaxSlope.ToString("0.0")+"% slope (limit "+settings.MaxSlopePercent+"%). Adjust the layout or review the limit; nothing was applied.");
    proposed.Add((study,units,surface));
   }
   if(mode==RunMode.Update&&report.Issues.Count==0)
   {
    if(proposed.Count==0){report.Applied=true;}
    else
    {
     string path=doc.Path;if(string.IsNullOrEmpty(path)||!File.Exists(path))throw new Exception("Save the Rhino model before running Update; a backup is required.");
     foreach(var item in proposed)foreach(var obj in item.Study.Objects.Where(o=>IsChangedObject(o,item.Study,doc)))if(obj.IsLocked||obj.IsReference)throw new Exception("Unlock affected geometry before Update: "+obj.Name);
     string backupDir=Path.Combine(Path.GetDirectoryName(path),"_backups");Directory.CreateDirectory(backupDir);string backup=Path.Combine(backupDir,Path.GetFileNameWithoutExtension(path)+"-RT-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff")+".3dm");
     if(!doc.Write3dmFile(backup,new Rhino.FileIO.FileWriteOptions{SuppressAllInput=true,UpdateDocumentPath=false}))throw new Exception("Backup could not be written. No changes were applied.");report.Backup=backup;
     uint undo=doc.BeginUndoRecord("FIELD Resort Terrain Update");
     try
     {
      foreach(var item in proposed)Apply(doc,item.Study,item.Units,item.Surface);
      var after=Model.Read(doc,settings.Scope);foreach(var s in after)if(Visibility.Audit(s.Units,settings).Any(l=>l.Drop<settings.RequiredDrop-1e-5))throw new Exception("Post-update visibility check failed. Restore using Undo or the backup.");
      Model.Bind(doc,after);
      foreach(var s in Model.Read(doc,settings.Scope))
      {var obj=doc.Objects.FirstOrDefault(o=>o.Name=="CONCEPT_TERRAIN_NOT_SURVEYED"&&doc.Layers[o.Attributes.LayerIndex].FullPath==s.Prefix+"03_TERRAIN");if(obj!=null){var a=obj.Attributes.Duplicate();a.SetUserString(FingerprintKey,Fingerprint(s,s.Units,settings));a.SetUserString("Field.ResortTerrain.MeshCRC",obj.Geometry.DataCRC(0).ToString());a.SetUserString("Field.ResortTerrain.DerivedCRC",DerivedCRC(s,doc));doc.Objects.ModifyAttributes(obj.Id,a,true);}}
      doc.Strings.SetString("Field.ResortTerrain.Settings",JsonSerializer.Serialize(settings));report.Applied=true;
     }
     finally{if(undo!=0)doc.EndUndoRecord(undo);doc.Views.Redraw();}
     if(settings.AutoSave){if(!doc.WriteFile(path,new Rhino.FileIO.FileWriteOptions{SuppressAllInput=true,UpdateDocumentPath=true}))report.Issues.Add("Geometry was updated but saving failed. Use Save; the pre-update backup is intact.");else report.SavedPath=path;}
    }
   }
   if(showOverlay){Overlay.Clear();Overlay.Current=overlay;overlay.Enabled=true;doc.Views.Redraw();}
   report.Seconds=watch.Elapsed.TotalSeconds;return report;
  }
  static bool IsChangedObject(RhinoObject o,Study s,RhinoDoc doc)=>s.Units.Any(u=>o.Id==u.Id||o.Name==u.Name||o.Name.StartsWith(u.Name+" ",StringComparison.Ordinal))||doc.Layers[o.Attributes.LayerIndex].FullPath.EndsWith("03_TERRAIN",StringComparison.Ordinal)||doc.Layers[o.Attributes.LayerIndex].FullPath.EndsWith("04_CONTOURS",StringComparison.Ordinal)||o.Name=="Site boundary draped on concept terrain";
  static void Apply(RhinoDoc doc,Study study,List<Unit> units,SurfaceResult surface)
  {
   foreach(var u in units)
   {
    var old=study.Units.First(x=>x.Id==u.Id);var module=doc.Objects.FindId(u.Id);if(!old.CurrentTransform.TryGetInverse(out Transform invCurrent)||!old.ReferenceTransform.TryGetInverse(out Transform invRef))throw new Exception("Invalid transform.");
    var moduleDelta=u.CurrentTransform*invCurrent;
    // Determine whether each linked object followed a user group transform already.
    var fill=(Mesh)study.Objects.First(o=>o.Name==u.Name+" footprint fill").Geometry;var actual=fill.Vertices.Select(v=>new Point3d(v.X,v.Y,v.Z)).ToArray();
    bool followed=actual.Zip(old.Points,(a,b)=>a.DistanceTo(b)).Max()<.03;var linkedDelta=followed?moduleDelta:u.CurrentTransform*invRef;
    Guid moduleId=u.Id;
    if(!moduleDelta.IsIdentity){moduleId=doc.Objects.Transform(u.Id,moduleDelta,true);if(moduleId==Guid.Empty)throw new Exception("Could not update building "+u.Name);}
    foreach(var obj in study.Objects)
    {
     if(obj.Id==u.Id)continue;
     if(obj.Name==u.Name+" footprint fill"||obj.Name==u.Name+" private garden"||obj.Name==u.Name+" terrace strip"||obj.Name==u.Name+" main view")
     {
      var objectDelta=linkedDelta;var anchorText=obj.Attributes.GetUserString("Field.ResortTerrain.Anchor");
      if(!string.IsNullOrEmpty(anchorText))
      {var xyz=JsonSerializer.Deserialize<double[]>(anchorText);var anchor=new Point3d(xyz[0],xyz[1],xyz[2]);var expected=anchor;expected.Transform(old.CurrentTransform*invRef);var actualAnchor=Model.Anchor(obj.Geometry);
       if(actualAnchor.DistanceTo(expected)<.03)objectDelta=moduleDelta;else if(actualAnchor.DistanceTo(anchor)<.03)objectDelta=u.CurrentTransform*invRef;else throw new Exception(obj.Name+": linked geometry was edited independently. Align and run ResortTerrainBind.");}
      if(!objectDelta.IsIdentity&&doc.Objects.Transform(obj.Id,objectDelta,true)==Guid.Empty)throw new Exception("Could not update "+obj.Name);
     }
     else if(obj.Name==u.Name&&obj.Geometry is TextEntity text)
     {var g=text.Duplicate() as TextEntity;var bb=new BoundingBox(u.Points);g.Plane=new Plane(new Point3d(bb.Center.X-3.5,bb.Min.Y-3,u.Ground+.12),Vector3d.ZAxis);if(!doc.Objects.Replace(obj.Id,g))throw new Exception("Could not update label "+u.Name);}
    }
    var current=doc.Objects.FindId(moduleId);var attributes=current.Attributes.Duplicate();attributes.SetUserString("ConceptElevation",u.Ground.ToString("R",System.Globalization.CultureInfo.InvariantCulture));attributes.SetUserString("ElevationBasis","VisibilityRegradedPad");attributes.SetUserString("VisibilityRuleVersion","3");attributes.SetUserString(Model.BindingKey,JsonSerializer.Serialize(new Binding{Matrix=Unit.Matrix(u.CurrentTransform),Footprint=u.Points.Select(p=>new[]{p.X,p.Y,p.Z}).ToArray(),View=new[]{u.View.X,u.View.Y}}));if(!doc.Objects.ModifyAttributes(moduleId,attributes,true))throw new Exception("Could not update building attributes.");
   }
   Guid terrainId=doc.Objects.AddMesh(surface.Mesh,Attr(study.TerrainLayer,"CONCEPT_TERRAIN_NOT_SURVEYED"));if(terrainId==Guid.Empty)throw new Exception("Could not add terrain mesh.");
   foreach(var curve in surface.Contours)if(doc.Objects.AddCurve(curve,Attr(study.ContourLayer,"Natural hillside contour"))==Guid.Empty)throw new Exception("Could not add contour.");
   foreach(var old in study.Objects.Where(o=>doc.Layers[o.Attributes.LayerIndex].FullPath.EndsWith("03_TERRAIN",StringComparison.Ordinal)||doc.Layers[o.Attributes.LayerIndex].FullPath.EndsWith("04_CONTOURS",StringComparison.Ordinal)))if(!doc.Objects.Delete(old.Id,true))throw new Exception("Could not remove previous terrain or contours.");
   var edge=study.Objects.FirstOrDefault(o=>o.Name=="Site boundary draped on concept terrain");if(edge!=null){if(!doc.Objects.Replace(edge.Id,surface.Edge))throw new Exception("Could not update draped boundary.");}else if(doc.Objects.AddCurve(surface.Edge,Attr(study.BoundaryLayer,"Site boundary draped on concept terrain"))==Guid.Empty)throw new Exception("Could not add draped boundary.");
  }
  public static string SaveReport(RhinoDoc doc,Report report)
  {
   string folder=string.IsNullOrEmpty(doc.Path)?Path.GetTempPath():Path.GetDirectoryName(doc.Path);folder=Path.Combine(folder,"terrain-reports");Directory.CreateDirectory(folder);string path=Path.Combine(folder,"resort-terrain-"+DateTime.Now.ToString("yyyyMMdd-HHmmss-fff")+".txt");File.WriteAllText(path,report.Text(),Encoding.UTF8);File.WriteAllText(Path.ChangeExtension(path,".json"),JsonSerializer.Serialize(report,new JsonSerializerOptions{WriteIndented=true}));return path;
  }
 }
}

