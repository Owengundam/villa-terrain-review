using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Text.Json;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace Field.ResortTerrain
{
 public static class SelfTests
 {
  static void Assert(bool condition,string message){if(!condition)throw new Exception("TEST FAILED: "+message);}
  static Unit U(string name,double x,double y,double z,Vector3d view)=>new Unit{Name=name,Id=Guid.NewGuid(),Points=new[]{new Point3d(x-5,y-6,z+.08),new Point3d(x+5,y-6,z+.08),new Point3d(x+5,y+6,z+.08),new Point3d(x-5,y+6,z+.08)},View=view,ReferencePoints=new Point3d[0],CurrentTransform=Transform.Identity,ReferenceTransform=Transform.Identity};
  static int Layer(RhinoDoc doc,string name,Guid parent){var l=new Layer{Name=name,ParentLayerId=parent};return doc.Layers.Add(l);}
  static RhinoDoc Fixture(string path)
  {
   var d=RhinoDoc.CreateHeadless(null);d.ModelUnitSystem=UnitSystem.Meters;int root=Layer(d,"TEST_STUDIES",Guid.Empty),option=Layer(d,"01_TEST",d.Layers[root].Id);var parent=d.Layers[option].Id;
   int boundary=Layer(d,"01_BOUNDARY",parent),terrain=Layer(d,"03_TERRAIN",parent),contours=Layer(d,"04_CONTOURS",parent),modules=Layer(d,"05_MODULES",parent),fills=Layer(d,"06_BUILDING_FILL",parent),arrows=Layer(d,"12_VIEW_DIRECTIONS",parent);
   d.Objects.AddCurve(new PolylineCurve(new[]{new Point3d(0,0,0),new Point3d(100,0,0),new Point3d(100,100,0),new Point3d(0,100,0),new Point3d(0,0,0)}),new ObjectAttributes{LayerIndex=boundary,Name="RT_BOUNDARY"});
   var shape=new PolylineCurve(new[]{new Point3d(-5,-6,0),new Point3d(5,-6,0),new Point3d(5,6,0),new Point3d(-5,6,0),new Point3d(-5,-6,0)});
   int def=d.InstanceDefinitions.Add("TestVilla","",Point3d.Origin,new[]{shape},new[]{new ObjectAttributes()});
   foreach(var u in new[]{U("A",30,75,10,-Vector3d.YAxis),U("B",30,30,10,-Vector3d.YAxis),U("C",70,70,15,-Vector3d.YAxis)})
   {
    var a=new ObjectAttributes{LayerIndex=modules,Name=u.Name};a.SetUserString("Function","villa");a.SetUserString("ConceptElevation",u.Ground.ToString());d.Objects.AddInstanceObject(def,Transform.Translation(u.Center.X,u.Center.Y,u.Ground+.12),a);
    var m=new Mesh();foreach(var p in u.Points)m.Vertices.Add(p);m.Faces.AddFace(0,1,2,3);m.Normals.ComputeNormals();d.Objects.AddMesh(m,new ObjectAttributes{LayerIndex=fills,Name=u.Name+" footprint fill"});
    d.Objects.AddCurve(new LineCurve(new Point3d(u.Center.X,u.Center.Y-6.5,u.Ground+.2),new Point3d(u.Center.X,u.Center.Y-11.5,u.Ground+.2)),new ObjectAttributes{LayerIndex=arrows,Name=u.Name+" main view"});
   }
   Assert(d.WriteFile(path,new Rhino.FileIO.FileWriteOptions{SuppressAllInput=true,UpdateDocumentPath=true}),"fixture save");return d;
  }
  public static string CheckCurrent(RhinoDoc doc)
  {
   var settings=new Settings();var before=doc.Objects.Where(o=>o!=null&&o.Geometry!=null).Select(o=>o.Geometry.DataCRC(0)).ToArray();var report=Workflow.Execute(doc,settings,RunMode.Check,new Work(),false);var after=doc.Objects.Where(o=>o!=null&&o.Geometry!=null).Select(o=>o.Geometry.DataCRC(0)).ToArray();Assert(before.SequenceEqual(after),"current model check is read-only");return JsonSerializer.Serialize(report,new JsonSerializerOptions{WriteIndented=true});
  }
  public static string Run(string folder)
  {
   Directory.CreateDirectory(folder);var passed=new List<string>();var settings=new Settings{AdjustLayout=false,GridSpacing=2.5,MaxSlopePercent=1000,AutoSave=true};
   var units=new List<Unit>{U("viewer",0,100,20,-Vector3d.YAxis),U("nearest",12,80,10,-Vector3d.YAxis),U("axial",0,0,10,-Vector3d.YAxis),U("behind",0,125,10,-Vector3d.YAxis)};
   var links=Visibility.Audit(units,settings).Where(l=>l.Viewer==0).ToList();Assert(links.Any(l=>l.Front==1&&l.Nearest&&!l.Axial),"nearest cone candidate outside axial corridor");Assert(links.Any(l=>l.Front==2&&l.Axial&&!l.Nearest),"far axial candidate retained");Assert(!links.Any(l=>l.Front==3),"behind building excluded");passed.Add("cone + axial union, including off-axis nearest and behind exclusion");
   bool invalid=false;try{new Settings{GridSpacing=double.NaN}.Validate();}catch{invalid=true;}Assert(invalid,"non-finite settings rejected");passed.Add("settings validation");
   using(var doc=Fixture(Path.Combine(folder,"fixture.3dm")))
   {
    var before=Model.Read(doc,"All options");Assert(before.Count==1&&before[0].Units.Count==3,"fixture discovery");var zero=settings.Copy();zero.MaxLevelChange=0;var notes=new List<string>();var blocked=LayoutSolver.Fit(before[0],zero,new Work(),notes);Assert(notes.Count>0,"infeasible level limits report conflict");Assert(blocked.Zip(before[0].Units,(a,b)=>Math.Abs(a.Ground-b.Ground)).Max()<1e-6,"zero movement limit respected");passed.Add("infeasible grading respects level bounds");
    var cycleStudy=new Study{Name="Cycle",Units=before[0].CopyUnits(),Boundary=before[0].Boundary};cycleStudy.Units[1].View=Vector3d.YAxis;var cycleNotes=new List<string>();LayoutSolver.Fit(cycleStudy,settings,new Work(),cycleNotes);Assert(cycleNotes.Any(x=>x.Contains("cycle")),"cycle detected before grading");passed.Add("impossible visibility cycles detected");
    var report=Workflow.Execute(doc,settings,RunMode.Update,new Work(),false);Assert(report.Applied,"successful update: "+string.Join("; ",report.Issues));Assert(report.Issues.Count==0,"no issues on feasible fixture");Assert(File.Exists(report.Backup)&&File.Exists(report.SavedPath),"backup and save");Assert(report.Options.All(r=>r.Failures==0&&r.ContactError<.03),"final visibility and contact checks");passed.Add("end-to-end terrain, contours, building levels, backup and save");
    var repeat=Workflow.Execute(doc,settings,RunMode.Update,new Work(),false);Assert(repeat.Options.All(r=>r.Unchanged),"unchanged options skipped");passed.Add("unchanged option cache");
    var study=Model.Read(doc,"All options")[0];var unit=study.Units[0];var oldCenter=unit.Center;var id=doc.Objects.Transform(unit.Id,Transform.Translation(1,0,0),true);Assert(id!=Guid.Empty,"manual block move");var read=Model.Read(doc,"All options")[0].Units.First(u=>u.Name==unit.Name);Assert(Math.Abs(read.Center.X-oldCenter.X-1)<1e-6,"block-only move tracked");passed.Add("block-only movement tracking");
    var update=Workflow.Execute(doc,settings,RunMode.Update,new Work(),false);Assert(update.Applied,"tracked move update: "+string.Join(";",update.Issues));passed.Add("linked geometry synchronized after block-only move");
    var partial=Model.Read(doc,"All options")[0];var pu=partial.Units.First(u=>u.Name==unit.Name);var rot=Transform.Rotation(5*Math.PI/180,Vector3d.ZAxis,pu.Center);
    doc.Objects.Transform(pu.Id,rot,true);doc.Objects.Transform(partial.Objects.First(o=>o.Name==pu.Name+" footprint fill").Id,rot,true);
    var rotated=Workflow.Execute(doc,settings,RunMode.Update,new Work(),false);Assert(rotated.Applied,"partially grouped rotation update");
    var synced=Model.Read(doc,"All options")[0];var su=synced.Units.First(u=>u.Name==pu.Name);var shaft=(Curve)synced.Objects.First(o=>o.Name==pu.Name+" main view").Geometry;var arrow=shaft.PointAtEnd-shaft.PointAtStart;arrow.Z=0;arrow.Unitize();Assert((arrow-su.View).Length<.001,"un-grouped arrow follows group rotation");passed.Add("partial group movement synchronizes arrows independently");
    var heightOnly=settings.Copy();heightOnly.RequiredDrop=5.5;var recalc=Workflow.Execute(doc,heightOnly,RunMode.Update,new Work(),false);Assert(recalc.Applied&&recalc.Options.All(o=>o.CachedTriangulation),"height-only edit reuses triangulation: "+recalc.Text());settings=heightOnly;passed.Add("height-only change reuses triangulation");
    var current=Model.Read(doc,"All options")[0];var count=doc.Objects.Count;var strict=settings.Copy();strict.MaxSlopePercent=1;var denied=Workflow.Execute(doc,strict,RunMode.Update,new Work(),false);Assert(!denied.Applied&&denied.Issues.Any(x=>x.Contains("slope")),"slope cap blocks application");Assert(count==doc.Objects.Count,"blocked update leaves geometry unchanged");passed.Add("steep terrain blocks update without model edits");
   }
   return JsonSerializer.Serialize(new{passed,tests=passed.Count,folder});
  }
 }
}



