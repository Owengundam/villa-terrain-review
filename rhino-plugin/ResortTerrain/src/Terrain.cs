using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace Field.ResortTerrain
{
 public sealed class SurfaceResult
 {
  public Mesh Mesh;public List<Curve> Contours=new List<Curve>();public Curve Edge;
  public double MaxSlope,ContactError;public bool CacheHit;public List<Point3d> SteepPoints=new List<Point3d>();
 }
 public static class Terrain
 {
  static readonly Dictionary<string,Mesh> Cache=new Dictionary<string,Mesh>();
  public static string Hash(string value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
  public static string Key(Study s,List<Unit> units,double spacing)
  {
   var b=new StringBuilder(s.Boundary.DataCRC(0).ToString());b.Append('|').Append(spacing.ToString("R",System.Globalization.CultureInfo.InvariantCulture));foreach(var u in units.OrderBy(u=>u.Name))foreach(var p in u.Points)b.Append('|').Append(Math.Round(p.X,5).ToString("F5",System.Globalization.CultureInfo.InvariantCulture)).Append(',').Append(Math.Round(p.Y,5).ToString("F5",System.Globalization.CultureInfo.InvariantCulture));return Hash(b.ToString());
  }
  public static SurfaceResult Build(Study study,List<Unit> units,HeightField f,Settings settings,Work work)
  {
   string key=Key(study,units,f.Step);bool cached=Cache.TryGetValue(key,out Mesh template);
   if(!cached)
   {
    var points=new List<Point3d>();var seen=new HashSet<(long,long)>();
    void Add(double x,double y){if(seen.Add(((long)Math.Round(x*1e5),(long)Math.Round(y*1e5))))points.Add(new Point3d(x,y,0));}
    for(int j=0;j<f.NY;j++){work.Pulse();for(int i=0;i<f.NX;i++){double x=f.X0+i*f.Step,y=f.Y0+j*f.Step;if(study.Boundary.Contains(new Point3d(x,y,0),Plane.WorldXY,.001)==PointContainment.Inside)Add(x,y);}}
    var edge=new List<Point3d>();foreach(double t in study.Boundary.DivideByLength(Math.Min(1,f.Step),true)){var p=study.Boundary.PointAt(t);p.Z=0;edge.Add(p);Add(p.X,p.Y);}if(edge.First().DistanceTo(edge.Last())>.0001)edge.Add(edge[0]);
    foreach(var u in units)for(int k=0;k<4;k++){var a=u.Points[k];var b=u.Points[(k+1)%4];int n=(int)Math.Ceiling(a.DistanceTo(b)/Math.Min(.8,f.Step));for(int i=0;i<n;i++){double t=(double)i/n;Add(a.X*(1-t)+b.X*t,a.Y*(1-t)+b.Y*t);}}
    template=Mesh.CreateFromTessellation(points,new[]{edge.AsEnumerable()},Plane.WorldXY,true);if(template==null)throw new Exception("Site triangulation failed.");
    var remove=new List<int>();for(int i=0;i<template.Faces.Count;i++){if(i%1000==0)work.Pulse();if(study.Boundary.Contains(template.Faces.GetFaceCenter(i),Plane.WorldXY,.001)==PointContainment.Outside)remove.Add(i);}template.Faces.DeleteFaces(remove);template.Compact();
    if(Cache.Count>=8){foreach(var m in Cache.Values)m.Dispose();Cache.Clear();}Cache[key]=template;
   }
   var mesh=template.DuplicateMesh();for(int i=0;i<mesh.Vertices.Count;i++){var v=mesh.Vertices[i];mesh.Vertices.SetVertex(i,v.X,v.Y,f.Sample(v.X,v.Y));}mesh.Normals.ComputeNormals();mesh.FaceNormals.ComputeFaceNormals();mesh.Compact();if(!mesh.IsValid)throw new Exception("Generated terrain mesh is invalid.");
   var result=new SurfaceResult{Mesh=mesh,CacheHit=cached};
   for(int i=0;i<mesh.Faces.Count;i++)
   {
    var face=mesh.Faces[i];var a=(Point3d)mesh.Vertices[face.A];var b=(Point3d)mesh.Vertices[face.B];var c=(Point3d)mesh.Vertices[face.C];var normal=Vector3d.CrossProduct(b-a,c-a);if(normal.Length<1e-8)continue;double slope=Math.Sqrt(normal.X*normal.X+normal.Y*normal.Y)/Math.Max(1e-10,Math.Abs(normal.Z))*100;result.MaxSlope=Math.Max(result.MaxSlope,slope);
    if(slope>settings.MaxSlopePercent&&result.SteepPoints.Count<200)result.SteepPoints.Add(mesh.Faces.GetFaceCenter(i));
   }
   double top=mesh.GetBoundingBox(true).Max.Z+100;
   foreach(var u in units)foreach(var p in u.Points.Concat(new[]{u.Center}))
   {
    var c=u.Center;double x=p.X*.999+c.X*.001,y=p.Y*.999+c.Y*.001;double t=Intersection.MeshRay(mesh,new Ray3d(new Point3d(x,y,top),-Vector3d.ZAxis));if(t<0)throw new Exception("Terrain is missing below "+u.Name);result.ContactError=Math.Max(result.ContactError,Math.Abs(top-t-u.Ground));
   }
   if(result.ContactError>.03)throw new Exception("Building contact error exceeds 3 cm. Use a finer terrain grid.");
   var bb=mesh.GetBoundingBox(true);int levels=(int)Math.Ceiling((bb.Max.Z-bb.Min.Z)/settings.ContourInterval)+2;if(levels>1000)throw new Exception("Too many contours. Increase the interval.");
   for(double z=Math.Floor(bb.Min.Z/settings.ContourInterval)*settings.ContourInterval;z<=bb.Max.Z;z+=settings.ContourInterval)
   {
    work.Pulse();foreach(var section in Intersection.MeshPlane(mesh,new Plane(new Point3d(0,0,z),Vector3d.ZAxis))??Array.Empty<Polyline>())if(section.Length>2){var curve=new PolylineCurve(section);curve.Transform(Transform.Translation(0,0,.035));result.Contours.Add(curve);}
   }
   var edgePoints=study.Boundary.DivideByLength(Math.Min(1,f.Step),true).Select(t=>{var p=study.Boundary.PointAt(t);return new Point3d(p.X,p.Y,f.Sample(p.X,p.Y)+.1);}).ToList();if(edgePoints[0].DistanceTo(edgePoints.Last())>.001)edgePoints.Add(edgePoints[0]);result.Edge=new PolylineCurve(edgePoints);return result;
  }
 }
}

