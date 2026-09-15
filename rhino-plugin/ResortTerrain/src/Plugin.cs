using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Text.Json;
using Eto.Forms;
using Eto.Drawing;
using Rhino;
using Rhino.Commands;
using Command = Rhino.Commands.Command;
using Rhino.PlugIns;

[assembly: System.Runtime.Versioning.TargetFramework(".NETCoreApp,Version=v8.0", FrameworkDisplayName=".NET 8.0")]
[assembly: AssemblyTitle("FIELD Resort Terrain")]
[assembly: AssemblyDescription("Bounded resort layout grading, visibility checks and terrain updates for Rhino 8.")]
[assembly: AssemblyCompany("FIELD")]
[assembly: AssemblyProduct("FIELD Resort Terrain")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]
[assembly: Guid("a63350d6-6888-4a5a-b22d-e7c040dfaa31")]

namespace Field.ResortTerrain
{
 public sealed class ResortTerrainPlugin:PlugIn
 {
  public static ResortTerrainPlugin Instance {get;private set;}
  public ResortTerrainPlugin(){Instance=this;}
  public override PlugInLoadTime LoadTime=>PlugInLoadTime.WhenNeeded;
 }
 public sealed class Request {public Settings Settings;public RunMode Mode;}
 public static class Interface
 {
  public static bool Busy;
  static readonly System.Collections.Generic.Dictionary<uint,Settings> Recent=new System.Collections.Generic.Dictionary<uint,Settings>();
  public static Settings ReadSettings(RhinoDoc doc){if(Recent.TryGetValue(doc.RuntimeSerialNumber,out Settings recent))return recent.Copy();try{return JsonSerializer.Deserialize<Settings>(doc.Strings.GetValue("Field.ResortTerrain.Settings")??"")??new Settings();}catch{return new Settings();}}
  public static Dialog<Request> BuildDialog(RhinoDoc doc)
  {
   var s=ReadSettings(doc);var dlg=new Dialog<Request>{Title="FIELD / Resort Terrain",Padding=16,Resizable=false};
   var scope=new DropDown();scope.Items.Add("All options");foreach(var study in Model.Read(doc,"All options"))scope.Items.Add(study.Name);scope.SelectedIndex=Math.Max(0,Enumerable.Range(0,scope.Items.Count).FirstOrDefault(i=>scope.Items[i].Text==s.Scope));
   NumericStepper Number(double value,double min,double max,double increment=1,int decimals=2)=>new NumericStepper{Value=value,MinValue=min,MaxValue=max,Increment=increment,DecimalPlaces=decimals,Width=120};
   var cone=Number(s.ConeDegrees,10,170,5,0);var drop=Number(s.RequiredDrop,0,20,.25);var margin=Number(s.Margin,0,5,.05);var level=Number(s.MaxLevelChange,0,50,.5);var rotation=Number(s.MaxRotation,0,60,5,0);var move=Number(s.MaxMove,0,30,1);var slope=Number(s.MaxSlopePercent,1,1000,5,0);var grid=Number(s.GridSpacing,.5,5,.25);var contour=Number(s.ContourInterval,.25,10,.25);var clearance=Number(s.MinimumClearance,0,20,.25);
   var layout=new CheckBox{Text="Try small building rotations and relocations",Checked=s.AdjustLayout};var save=new CheckBox{Text="Save the model after a successful update",Checked=s.AutoSave};
   var form=new DynamicLayout{Spacing=new Size(8,7)};
   form.AddRow(new Label{Text="Update the ground when your layout changes.",Font=new Font(SystemFont.Bold)});form.AddRow(new Label{Text="Front = nearest in cone + all in the forward building-width corridor."});form.AddRow(null);form.AddRow("Options",scope);form.AddRow("Viewing cone (degrees)",cone);form.AddRow("Required front drop (m)",drop);form.AddRow("Additional height margin (m)",margin);form.AddRow("Maximum level change per update (m)",level);form.AddRow("Maximum rotation per update (degrees)",rotation);form.AddRow("Maximum relocation per update (m)",move);form.AddRow("Minimum footprint clearance (m)",clearance);form.AddRow("Maximum terrain slope (%)",slope);form.AddRow("Final grid spacing (m)",grid);form.AddRow("Contour interval (m)",contour);form.AddRow(layout);form.AddRow(save);form.AddRow(new Label{Text="Limits are strict: unresolved conflicts leave the model unchanged.\nA backup is created before every geometry update. Press Esc to cancel a calculation."});
   Request Read(RunMode mode)=>new Request{Mode=mode,Settings=new Settings{Scope=scope.Items[scope.SelectedIndex].Text,ConeDegrees=cone.Value,RequiredDrop=drop.Value,Margin=margin.Value,MaxLevelChange=level.Value,MaxRotation=rotation.Value,MaxMove=move.Value,MinimumClearance=clearance.Value,MaxSlopePercent=slope.Value,GridSpacing=grid.Value,ContourInterval=contour.Value,AdjustLayout=layout.Checked==true,AutoSave=save.Checked==true}};
   var check=new Button{Text="Check"};check.Click+=(o,e)=>dlg.Close(Read(RunMode.Check));var preview=new Button{Text="Coarse dry run"};preview.Click+=(o,e)=>dlg.Close(Read(RunMode.Preview));var update=new Button{Text="Update + Check"};update.Click+=(o,e)=>dlg.Close(Read(RunMode.Update));var cancel=new Button{Text="Cancel"};cancel.Click+=(o,e)=>dlg.Close(null);dlg.AbortButton=cancel;dlg.DefaultButton=check;form.AddRow(null);form.AddRow(check,preview,update,cancel);dlg.Content=form;
   return dlg;
  }
  public static Request Ask(RhinoDoc doc){using(var dialog=BuildDialog(doc))return dialog.ShowModal(Rhino.UI.RhinoEtoApp.MainWindowForDocument(doc));}
  public static void ShowReport(RhinoDoc doc,Report report,string path)
  {
   var dlg=new Dialog{Title="Resort Terrain / Results",Padding=12,Resizable=true,ClientSize=new Size(750,530)};var text=new TextArea{ReadOnly=true,Text=report.Text(),Wrap=true};var close=new Button{Text="Close"};close.Click+=(o,e)=>dlg.Close();var clear=new Button{Text="Clear highlights"};clear.Click+=(o,e)=>{Overlay.Clear();doc.Views.Redraw();};var content=new DynamicLayout{Spacing=new Size(8,8)};content.Add(text,true,true);content.AddRow(new Label{Text="Report saved: "+path});content.AddRow(clear,null,close);dlg.Content=content;dlg.DefaultButton=close;dlg.ShowModal(Rhino.UI.RhinoEtoApp.MainWindowForDocument(doc));
  }
  public static Result Run(RhinoDoc doc,RunMode? mode,RunMode fallback,Rhino.Commands.RunMode commandMode)
  {
   if(Busy){RhinoApp.WriteLine("A Resort Terrain calculation is already running.");return Result.Cancel;}
   Busy=true;var work=new Work();EventHandler cancel=(o,e)=>work.Cancelled=true;
   try
   {
    var request=mode.HasValue?new Request{Mode=mode.Value,Settings=ReadSettings(doc)}:Ask(doc);if(request==null)return Result.Cancel;
    Recent[doc.RuntimeSerialNumber]=request.Settings.Copy();RhinoApp.EscapeKeyPressed+=cancel;RhinoApp.WriteLine("FIELD Resort Terrain: {0}. Press Esc to cancel.",request.Mode);
    var report=Workflow.Execute(doc,request.Settings,request.Mode,work);string path=Workflow.SaveReport(doc,report);RhinoApp.WriteLine(report.Text());
    if(commandMode==Rhino.Commands.RunMode.Interactive)ShowReport(doc,report,path);return report.Issues.Count==0||report.Applied?Result.Success:Result.Failure;
   }
   catch(OperationCanceledException){RhinoApp.WriteLine("Calculation cancelled before applying geometry.");return Result.Cancel;}
   catch(Exception e){RhinoApp.WriteLine("Resort Terrain: "+e.Message);return Result.Failure;}
   finally{RhinoApp.EscapeKeyPressed-=cancel;Busy=false;}
  }
 }
 public sealed class ResortTerrainCommand:Command
 {
  public override string EnglishName=>"ResortTerrain";
  protected override Result RunCommand(RhinoDoc doc,Rhino.Commands.RunMode mode)=>Interface.Run(doc,null,RunMode.Check,mode);
 }
 public sealed class ResortTerrainCheckCommand:Command
 {
  public override string EnglishName=>"ResortTerrainCheck";
  protected override Result RunCommand(RhinoDoc doc,Rhino.Commands.RunMode mode)=>Interface.Run(doc,RunMode.Check,RunMode.Check,mode);
 }
 public sealed class ResortTerrainUpdateCommand:Command
 {
  public override string EnglishName=>"ResortTerrainUpdate";
  protected override Result RunCommand(RhinoDoc doc,Rhino.Commands.RunMode mode)=>Interface.Run(doc,RunMode.Update,RunMode.Update,mode);
 }
 public sealed class ResortTerrainClearCommand:Command
 {
  public override string EnglishName=>"ResortTerrainClear";
  protected override Result RunCommand(RhinoDoc doc,Rhino.Commands.RunMode mode){Overlay.Clear();doc.Views.Redraw();return Result.Success;}
 }
 public sealed class ResortTerrainBindCommand:Command
 {
  public override string EnglishName=>"ResortTerrainBind";
  protected override Result RunCommand(RhinoDoc doc,Rhino.Commands.RunMode mode)
  {
   try{var studies=Model.Read(doc,"All options",true);uint undo=doc.BeginUndoRecord("Bind Resort Terrain building tracking");try{Model.Bind(doc,studies);}finally{if(undo!=0)doc.EndUndoRecord(undo);}RhinoApp.WriteLine("Building tracking initialized. Blocks can now move independently; Update will synchronize their footprints, gardens, arrows and labels.");return Result.Success;}catch(Exception e){RhinoApp.WriteLine(e.Message);return Result.Failure;}
  }
 }
}



