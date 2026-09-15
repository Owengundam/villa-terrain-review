using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using Rhino;
using Rhino.Geometry;

namespace Field.ResortTerrain
{
 public sealed class Work
 {
  public bool Cancelled; readonly Stopwatch clock=Stopwatch.StartNew();
  public void Pulse(){if(clock.ElapsedMilliseconds>150){RhinoApp.Wait();clock.Restart();}if(Cancelled)throw new OperationCanceledException();}
 }
 public static class LayoutSolver
 {
  static double Loss(List<Unit> units,Settings s)=>Visibility.Audit(units,s).Sum(l=>Math.Pow(Math.Max(0,s.RequiredDrop+s.Margin-l.Drop),2));
  public static List<Unit> Fit(Study study,Settings settings,Work work,List<string> notes)
  {
   var units=study.CopyUnits();
   if(settings.AdjustLayout)
   for(int pass=0;pass<2;pass++)
   {
    var offenders=Visibility.Audit(units,settings).Where(l=>l.Drop<settings.RequiredDrop+settings.Margin-1e-5).Select(l=>l.Viewer).Distinct().ToList();
    foreach(int i in offenders)
    {
     double best=Loss(units,settings);Unit chosen=units[i];var original=study.Units[i];
     // Every candidate is measured from the user's current position, never from a prior trial.
     var angles=new List<double>{0};for(double a=5;a<=settings.MaxRotation+1e-8;a+=5){angles.Add(a);angles.Add(-a);}if(settings.MaxRotation>0&&!angles.Contains(settings.MaxRotation)){angles.Add(settings.MaxRotation);angles.Add(-settings.MaxRotation);}
     var radii=new List<double>{0};for(double r=3;r<=settings.MaxMove;r+=3)radii.Add(r);if(settings.MaxMove>0&&!radii.Contains(settings.MaxMove))radii.Add(settings.MaxMove);
     foreach(double radius in radii)foreach(double angle in angles)for(int direction=0;direction<(radius==0?1:8);direction++)
     {
      work.Pulse();var candidate=original.Clone();candidate.Move(angle,radius*Math.Cos(direction*Math.PI/4),radius*Math.Sin(direction*Math.PI/4),0);
      if(!Visibility.ValidPlacement(candidate,units.Where((u,j)=>i!=j),study.Boundary,settings.MinimumClearance))continue;
      var trial=units.ToList();trial[i]=candidate;double cost=Loss(trial,settings)+.00035*angle*angle+.012*radius*radius;
      if(cost<best-1e-7){best=cost;chosen=candidate;}
     }
     units[i]=chosen;
    }
   }
   var links=Visibility.Audit(units,settings);int n=units.Count;var originalZ=units.Select(u=>u.Ground).ToArray();var z=originalZ.ToArray();var weight=units.Select(u=>Math.Max(.1,AreaMassProperties.Compute(u.Outline()).Area/253)).ToArray();
   var visited=new int[n];
   bool Visit(int i){if(visited[i]==1)return true;if(visited[i]==2)return false;visited[i]=1;foreach(var l in links.Where(l=>l.Viewer==i))if(Visit(l.Front))return true;visited[i]=2;return false;}
   for(int i=0;i<n;i++)if(Visit(i)){notes.Add(study.Name+": the front-view relationships contain a cycle. Rotate or move the highlighted buildings; elevations alone cannot solve it.");return units;}
   var dual=new double[links.Count];var box=new double[n];double target=settings.RequiredDrop+settings.Margin;
   for(int iteration=0;iteration<12000;iteration++)
   {
    if(iteration%20==0)work.Pulse();double change=0;
    for(int k=0;k<links.Count;k++)
    {
     int a=links[k].Viewer,b=links[k].Front;double ya=z[a]-dual[k]/weight[a],yb=z[b]+dual[k]/weight[b];double lambda=Math.Max(0,(target-ya+yb)/(1/weight[a]+1/weight[b]));z[a]=ya+lambda/weight[a];z[b]=yb-lambda/weight[b];dual[k]=lambda;
    }
    for(int i=0;i<n;i++){double y=z[i]+box[i],v=Math.Clamp(y,originalZ[i]-settings.MaxLevelChange,originalZ[i]+settings.MaxLevelChange);box[i]=y-v;change=Math.Max(change,Math.Abs(v-z[i]));z[i]=v;}
    if(iteration>5&&change<1e-7&&links.All(l=>z[l.Viewer]-z[l.Front]>=target-1e-5))break;
   }
   for(int i=0;i<n;i++)units[i].Move(0,0,0,z[i]-originalZ[i]);
   var failures=Visibility.Audit(units,settings).Where(l=>l.Drop<target-1e-4).ToList();
   foreach(var l in failures)notes.Add(study.Name+": "+units[l.Viewer].Name+" → "+units[l.Front].Name+" needs more room or a level change beyond the allowed limit.");
   return units;
  }
 }
 public sealed class HeightField
 {
  public double X0,Y0,Step; public int NX,NY; public double[] Z; public List<Unit> Units;
  public double Sample(double x,double y,bool pads=true)
  {
   if(pads)foreach(var unit in Units)
   {
    var c=unit.Center;var ex=unit.Points[1]-unit.Points[0];var ey=unit.Points[3]-unit.Points[0];double w=ex.Length,h=ey.Length;ex.Unitize();ey.Unitize();var d=new Vector3d(x-c.X,y-c.Y,0);
    if(Math.Abs(d*ex)<=w/2+.001&&Math.Abs(d*ey)<=h/2+.001)return unit.Ground;
   }
   double fx=(x-X0)/Step,fy=(y-Y0)/Step;int i=Math.Clamp((int)Math.Floor(fx),0,NX-2),j=Math.Clamp((int)Math.Floor(fy),0,NY-2);double u=Math.Clamp(fx-i,0,1),v=Math.Clamp(fy-j,0,1);
   return (1-v)*((1-u)*Z[j*NX+i]+u*Z[j*NX+i+1])+v*((1-u)*Z[(j+1)*NX+i]+u*Z[(j+1)*NX+i+1]);
  }
 }
 public static class GroundSolver
 {
  static double Kernel(double r2)=>r2<1e-12?0:.5*r2*Math.Log(r2);
  static double[] SolveDense(double[,] a,double[] b)
  {
   int n=b.Length;for(int i=0;i<n;i++){int pivot=i;for(int j=i+1;j<n;j++)if(Math.Abs(a[j,i])>Math.Abs(a[pivot,i]))pivot=j;if(Math.Abs(a[pivot,i])<1e-12)throw new Exception("Building centres cannot define a stable terrain field.");for(int k=i;k<n;k++){double t=a[i,k];a[i,k]=a[pivot,k];a[pivot,k]=t;}double v=b[i];b[i]=b[pivot];b[pivot]=v;v=a[i,i];for(int k=i;k<n;k++)a[i,k]/=v;b[i]/=v;for(int j=0;j<n;j++)if(j!=i){v=a[j,i];for(int k=i;k<n;k++)a[j,k]-=v*a[i,k];b[j]-=v*b[i];}}return b;
  }
  public static HeightField Build(Study study,List<Unit> units,double spacing,Work work)
  {
   var bounds=study.Boundary.GetBoundingBox(true);var f=new HeightField{X0=bounds.Min.X-15,Y0=bounds.Min.Y-15,Step=spacing,NX=(int)Math.Ceiling((bounds.Max.X-bounds.Min.X+30)/spacing)+1,NY=(int)Math.Ceiling((bounds.Max.Y-bounds.Min.Y+30)/spacing)+1,Units=units};
   int count=f.NX*f.NY;if(count>200000)throw new Exception("Terrain grid is too large. Increase grid spacing or reduce the study boundary.");
   int n=units.Count;double[,] dense=new double[n+3,n+3];double[] rhs=new double[n+3];var centers=units.Select(u=>u.Center-new Vector3d(f.X0,f.Y0,0)).ToArray();
   if(n<3)throw new Exception("At least three non-collinear building pads are required.");
   for(int i=0;i<n;i++)
   {
    for(int j=0;j<n;j++){double dx=centers[i].X-centers[j].X,dy=centers[i].Y-centers[j].Y;dense[i,j]=Kernel(dx*dx+dy*dy)+(i==j?800:0);}
    dense[i,n]=dense[n,i]=1;dense[i,n+1]=dense[n+1,i]=centers[i].X;dense[i,n+2]=dense[n+2,i]=centers[i].Y;rhs[i]=units[i].Ground;
   }
   var coefficients=SolveDense(dense,rhs);var broad=new double[count];var held=new bool[count];var fixedZ=new double[count];
   var pads=units.Select(u=>{var ex=u.Points[1]-u.Points[0];var ey=u.Points[3]-u.Points[0];double w=ex.Length,h=ey.Length;ex.Unitize();ey.Unitize();return (u.Center,ex,ey,w,h,u.Ground);}).ToArray();
   for(int j=0;j<f.NY;j++){work.Pulse();for(int i=0;i<f.NX;i++)
   {
    int k=j*f.NX+i;double x=i*spacing,y=j*spacing,z=coefficients[n]+coefficients[n+1]*x+coefficients[n+2]*y;
    for(int b=0;b<n;b++){double dx=x-centers[b].X,dy=y-centers[b].Y;z+=coefficients[b]*Kernel(dx*dx+dy*dy);}broad[k]=z;
    if(i<2||j<2||i>=f.NX-2||j>=f.NY-2){held[k]=true;fixedZ[k]=z;}
    foreach(var pad in pads){var d=new Vector3d(x+f.X0-pad.Center.X,y+f.Y0-pad.Center.Y,0);if(Math.Abs(d*pad.ex)<=pad.w/2+.35&&Math.Abs(d*pad.ey)<=pad.h/2+.35){held[k]=true;fixedZ[k]=pad.Ground;break;}}
   }}
   void Lap(double[] a,double[] b){for(int j=0;j<f.NY;j++)for(int i=0;i<f.NX;i++){int k=j*f.NX+i;b[k]=4*a[k]-(i>0?a[k-1]:0)-(i+1<f.NX?a[k+1]:0)-(j>0?a[k-f.NX]:0)-(j+1<f.NY?a[k+f.NX]:0);}}
   var temp=new double[count];var temp2=new double[count];
   void Apply(double[] a,double[] b){Lap(a,temp);Lap(temp,temp2);for(int k=0;k<count;k++)b[k]=held[k]?0:temp2[k]+.035*temp[k]+.000015*a[k];}
   var afixed=new double[count];Apply(fixedZ,afixed);var xfree=new double[count];var r=new double[count];var direction=new double[count];var ad=new double[count];
   for(int k=0;k<count;k++)if(!held[k])xfree[k]=broad[k];Apply(xfree,ad);
   double rr=0;for(int k=0;k<count;k++){r[k]=held[k]?0:.000015*broad[k]-afixed[k]-ad[k];direction[k]=r[k];rr+=r[k]*r[k];}
   double initial=Math.Max(rr,1e-20);int iteration=0;
   for(;iteration<6500&&rr>Math.Max(1e-12,initial*1e-12);iteration++)
   {
    if(iteration%15==0)work.Pulse();Apply(direction,ad);double denominator=0;for(int k=0;k<count;k++)denominator+=direction[k]*ad[k];if(denominator<=0)throw new Exception("Terrain solver lost numerical stability.");double alpha=rr/denominator;double next=0;
    for(int k=0;k<count;k++){xfree[k]+=alpha*direction[k];r[k]-=alpha*ad[k];next+=r[k]*r[k];}double beta=next/rr;for(int k=0;k<count;k++)direction[k]=r[k]+beta*direction[k];rr=next;
   }
   if(rr>Math.Max(1e-10,initial*1e-10))throw new Exception("Terrain did not converge. Increase grid spacing and try again.");
   f.Z=new double[count];for(int k=0;k<count;k++){f.Z[k]=held[k]?fixedZ[k]:xfree[k];if(!double.IsFinite(f.Z[k]))throw new Exception("Invalid terrain height.");}return f;
  }
 }
}
