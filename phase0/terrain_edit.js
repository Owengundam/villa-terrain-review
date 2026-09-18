/* Terrain editing: simplify contour lines to at most 10 draggable control points,
   then rebuild pad references and downhill views from the edited control lines.
   Elevation uses inverse-distance-squared weighting over the sampled control
   polylines; downhill view is the negative numerical gradient of that field. */
const TerrainEdit=(()=>{
 const MAX=10;
 function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
 function dp(pts,eps){const keep=new Array(pts.length).fill(false);keep[0]=keep[pts.length-1]=true;const stack=[[0,pts.length-1]];
  while(stack.length){const [a,b]=stack.pop();let far=eps,idx=-1;
   for(let k=a+1;k<b;k++){const d=segDist(pts[k],pts[a],pts[b]);if(d>far){far=d;idx=k;}}
   if(idx>0){keep[idx]=true;stack.push([a,idx],[idx,b]);}}
  return pts.filter((_,i)=>keep[i]).map(p=>p.slice());}
 function simplify(points,max=MAX){
  const copy=points.map(p=>p.slice());      // never alias the caller's arrays
  if(copy.length<=max)return copy;
  let lo=0,hi=0;
  for(const p of copy)hi=Math.max(hi,Math.hypot(p[0]-copy[0][0],p[1]-copy[0][1]));hi*=2;
  let best=null;
  for(let it=0;it<48&&hi-lo>1e-4;it++){const mid=(lo+hi)/2,r=dp(copy,mid);
   if(r.length<=max){best=r;hi=mid;}else lo=mid;}
  if(!best||best.length>max){
   const step=(copy.length-1)/(max-1);
   best=Array.from({length:max},(_,k)=>copy[Math.round(k*step)].slice());
   best[0]=copy[0].slice();best[max-1]=copy[copy.length-1].slice();
  }
  const out=[best[0].slice()];
  for(let k=1;k<best.length;k++)if(Math.hypot(best[k][0]-out[out.length-1][0],best[k][1]-out[out.length-1][1])>1e-9)out.push(best[k].slice());
  return out;}
 function buildFromContours(contours,max=MAX){
  return contours.map((c,i)=>({id:c.id||('L'+(i+1)),z:c.z,count:c.points.length,controls:simplify(c.points,max)}));}
 function samples(lines,step=4){
  const out=[];
  for(const l of lines){
   const p=l.controls;
   for(let k=0;k+1<p.length;k++){
    const a=p[k],b=p[k+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(d/step));
    for(let s=0;s<n;s++){const t=s/n;out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),l.z]);}}
   out.push([p[p.length-1][0],p[p.length-1][1],l.z]);}
  return out;}
 function elevation(x,y,pts){
  let num=0,den=0;
  for(let k=0;k<pts.length;k++){
   const dx=pts[k][0]-x,dy=pts[k][1]-y,d2=dx*dx+dy*dy;
   if(d2<1e-9)return pts[k][2];
   const w=1/d2;num+=w*pts[k][2];den+=w;}
  return den?num/den:0;}
 function downhill(center,pts,fallback,eps=2){
  const gx=(elevation(center[0]+eps,center[1],pts)-elevation(center[0]-eps,center[1],pts))/(2*eps);
  const gy=(elevation(center[0],center[1]+eps,pts)-elevation(center[0],center[1]-eps,pts))/(2*eps);
  const m=Math.hypot(gx,gy);
  if(!Number.isFinite(m)||m<1e-4)return fallback?fallback.slice():[0,1];
  return [-gx/m,-gy/m];}
 function apply(data,lines,perpTol=0){
  const pts=samples(lines);
  return data.layouts.map(l=>({...l,units:l.units.map(u=>{
   const view=downhill(u.center,pts,u.view);
   // Coupled orientation: rotate the footprint with the view so the long axis stays
   // perpendicular to the local contour, facing downhill (mandatory planning rule).
   // Villas already within perpTol of the new downhill keep their orientation —
   // rotation beyond the acceptable angle is unnecessary disturbance.
   const err=Math.acos(Math.max(-1,Math.min(1,u.view[0]*view[0]+u.view[1]*view[1])))*180/Math.PI;
   if(!Number.isFinite(err)||(perpTol>0&&err<=perpTol))return {...u,reference:elevation(u.center[0],u.center[1],pts)};
   const ang=Math.atan2(u.view[0]*view[1]-u.view[1]*view[0],u.view[0]*view[0]+u.view[1]*view[1]);
   if(!Number.isFinite(ang)||Math.abs(ang)<1e-6)return {...u,view,reference:elevation(u.center[0],u.center[1],pts)};
   const c=Math.cos(ang),s=Math.sin(ang);
   const points=u.points.map(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return [u.center[0]+dx*c-dy*s,u.center[1]+dx*s+dy*c];});
   return {...u,view,points,reference:elevation(u.center[0],u.center[1],pts),rotation:(u.rotation||0)+ang};
  })}));}
 function diff(before,after){
  let maxShift=0,rotated=0;
  before.forEach((l,li)=>l.units.forEach((u,i)=>{
   maxShift=Math.max(maxShift,Math.abs(after[li].units[i].reference-u.reference));
   const v0=u.view,v1=after[li].units[i].view;
   const dot=Math.max(-1,Math.min(1,v0[0]*v1[0]+v0[1]*v1[1]));
   if(Math.acos(dot)*180/Math.PI>0.5)rotated++;}));
  return {maxShift,rotated};}
 /* Landmass change: cut/fill volume between the shipped terrain and the edited terrain.
   Integrates (editedZ - originalZ) over a regular grid clipped to the site boundary.
   Metres³; cut = excavation, fill = added ground. */
 function polyArea(poly){let a=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)a+=(poly[j][0]+poly[i][0])*(poly[j][1]-poly[i][1]);return a/2;}
 function pointInPoly(p,poly){let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
   if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi))inside=!inside;}
  return inside;}
 function volume(originalLines,editedLines,boundary,step=4){
  const oPts=samples(originalLines),ePts=samples(editedLines);
  const xs=boundary.map(p=>p[0]),ys=boundary.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  let cut=0,fill=0,cells=0;
  for(let x=x0+step/2;x<x1;x+=step)for(let y=y0+step/2;y<y1;y+=step){
   if(!(pointInPoly([x,y],boundary)||pointInPoly([x-step/2,y-step/2],boundary)||pointInPoly([x+step/2,y-step/2],boundary)||pointInPoly([x+step/2,y+step/2],boundary)||pointInPoly([x-step/2,y+step/2],boundary)))continue;
   const dz=elevation(x,y,ePts)-elevation(x,y,oPts);
   if(dz<0)cut-=dz*step*step;else fill+=dz*step*step;
   cells++;}
  return {cut,fill,net:fill-cut,area:cells*step*step,step,siteArea:Math.abs(polyArea(boundary))};}
 /* Live geometry checks on the CURRENT (possibly rotated) footprints.
    polyDist: minimum distance between two convex polygons (0 if overlapping). */
 function segSeg(a,b,c,d){function cross(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
  const d1=cross(c,d,a),d2=cross(c,d,b),d3=cross(a,b,c),d4=cross(a,b,d);
  return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));}
 function ptPolyDist(p,poly){let best=Infinity;
  for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length];
   best=Math.min(best,segDist(p,a,b));}
  return best;}
 function polyDist(p1,p2){
  for(let k=0;k<p1.length;k++)if(ptPolyDist(p1[k],p2)===0)return 0;
  for(let k=0;k<p2.length;k++)if(ptPolyDist(p2[k],p1)===0)return 0;
  let best=Infinity;
  for(let k=0;k<p1.length;k++)best=Math.min(best,ptPolyDist(p1[k],p2));
  for(let k=0;k<p2.length;k++)best=Math.min(best,ptPolyDist(p2[k],p1));
  return best;}
 const SIDE_GAP=3;
 function geomCheck(l,boundary,active=null,sideGap=SIDE_GAP){
  const act=active||l.units.map(()=>true);
  const issues=[],conflicts=[];
  for(let i=0;i<l.units.length;i++)for(let j=i+1;j<l.units.length;j++){
   if(act[i]&&act[j]&&polyDist(l.units[i].points,l.units[j].points)<sideGap-1e-6){conflicts.push([i,j]);issues.push({type:'clearance',i,j});}}
  if(boundary)for(let i=0;i<l.units.length;i++){
   if(!act[i])continue;
   const out=l.units[i].points.some(p=>!pointInPoly(p,boundary));
   if(out){issues.push({type:'boundary',i});}}
  return {conflicts,issues,ok:!issues.length};}
 /* Orientation deviation of a footprint's view from the terrain downhill, in degrees. */
 function orientationError(u,pts){
  const ideal=downhill(u.center,pts,u.view);
  const dot=Math.max(-1,Math.min(1,u.view[0]*ideal[0]+u.view[1]*ideal[1]));
  return Math.acos(dot)*180/Math.PI;}
  /* Start fitting: legalize the arrangement — slide villas along facade/view axes to
   clear clearance/boundary conflicts, re-aim moved villas to the local downhill at
   their new centre (a slide across contours can otherwise leave the arrow pointing
   uphill), then shrink movements. Removal is NOT done here — ghosting stays with the
   view solver. cfg: sideGap (m), maxMove (m), perpTol (deg). Every accepted change
   strictly reduces (or keeps) the total issue count, so fitting never worsens it. */
 function fitLayout(l,boundary,pts,cfg={}){
  const sideGap=cfg.sideGap??SIDE_GAP,maxMove=cfg.maxMove??12,perpTol=cfg.perpTol??0;
  const units=l.units.map(u=>({...u,points:u.points.map(p=>p.slice()),center:u.center.slice()}));
  const moves=units.map(()=>({dx:0,dy:0,rot:0}));
  const centre=u=>u.points.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/u.points.length);
  const live=()=>geomCheck({units},boundary,units.map(()=>true),sideGap);
  // Conflict + boundary repair in one loop: every accepted move must strictly
  // reduce the total issue count, so fitting never makes the layout worse.
  const issueCount=()=>{const g=live();return g.conflicts.length+g.issues.length;};
  for(let pass=0;pass<80;pass++){
   const g=live();
   if(!g.conflicts.length&&!g.issues.length)break;
   let repaired=false;
   const pairs=[...g.conflicts];
   const boundaryIdx=g.issues.filter(x=>x.type==='boundary').map(x=>x.i);
   // boundary villas slide inward along every axis direction
   for(const a of boundaryIdx){
    const u=units[a];
    const v=u.view,axis=[v[1],-v[0]];
    const c=centre(u),home=l.units[a].center;
    const inward=[[home[0]-c[0],home[1]-c[1]],[v[0],v[1]],[-v[0],-v[1]],[axis[0],axis[1]],[-axis[0],-axis[1]]];
    let fixed=false;
    for(const [ux,uy] of inward){
     const m=Math.hypot(ux,uy);if(m<1e-9)continue;
     for(const step of [4,2,1,.5]){
      const dx=ux/m*step,dy=uy/m*step;
      const total=Math.hypot(moves[a].dx+dx,moves[a].dy+dy);
      if(total>maxMove)continue;
      const trial=units.map((q,k)=>k===a?{...u,center:[u.center[0]+dx,u.center[1]+dy],points:u.points.map(p=>[p[0]+dx,p[1]+dy])}:q);
      const tg=geomCheck({units:trial},boundary,trial.map(()=>true),sideGap);
      if(tg.conflicts.length+tg.issues.length<issueCount()){
       units[a]=trial[a];moves[a].dx+=dx;moves[a].dy+=dy;repaired=true;fixed=true;break;
      }
     }
     if(fixed)break;
    }
    if(repaired)break;
   }
   if(repaired)continue;
   // clearance pairs: slide the villa whose facade axis points away from the other
   for(const [i,j] of pairs){
    const before=issueCount();
    for(const [a,b] of [[i,j],[j,i]]){
     const u=units[a],other=units[b];
     // try all four slide directions (facade axis and view axis, both ways)
     const v=u.view,axis=[v[1],-v[0]];
     const dirs=[[axis[0],axis[1]],[-axis[0],-axis[1]],[v[0],v[1]],[-v[0],-v[1]]];
     for(const [ux,uy] of dirs){
      for(const step of [4,2,1,.5]){
       const dx=ux*step,dy=uy*step;
       const total=Math.hypot(moves[a].dx+dx,moves[a].dy+dy);
       if(total>maxMove)continue;
       const trial=units.map((q,k)=>k===a?{...u,center:[u.center[0]+dx,u.center[1]+dy],points:u.points.map(p=>[p[0]+dx,p[1]+dy])}:q);
       const tc=geomCheck({units:trial},boundary,trial.map(()=>true),sideGap);
       if(tc.conflicts.length+tc.issues.length<before){
        units[a]=trial[a];moves[a].dx+=dx;moves[a].dy+=dy;repaired=true;break;
       }
      }
      if(repaired)break;
     }
     if(repaired)break;
    }
    if(repaired)break;
   }
   if(!repaired)break;
  }
  // 3. Orientation repair: a moved villa can now sit where its (unchanged) view
  //    disagrees with the local downhill — even pointing uphill. Re-aim every villa
  //    beyond perpTol to the downhill at its CURRENT centre; keep the rotation only
  //    if it does not increase conflicts/boundary issues.
  const tol=cfg.perpTol??0;
  units.forEach((u,i)=>{
   const err=orientationError(u,pts);
   if(err<=tol)return;
   const view=downhill(u.center,pts,u.view);
   const ang=Math.atan2(u.view[0]*view[1]-u.view[1]*view[0],u.view[0]*view[0]+u.view[1]*view[1]);
   if(!Number.isFinite(ang)||Math.abs(ang)<1e-6)return;
   const c=Math.cos(ang),s=Math.sin(ang);
   const rotated={...u,points:u.points.map(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return [u.center[0]+dx*c-dy*s,u.center[1]+dx*s+dy*c];}),view,rotation:(u.rotation||0)+ang};
   const trial=units.map((q,k)=>k===i?rotated:q);
   const tg=geomCheck({units:trial},boundary,trial.map(()=>true),sideGap);
   if(tg.conflicts.length+tg.issues.length<=issueCount()){
    units[i]=rotated;moves[i].rot+=ang;
   }});
  // 4. Shrinking: once legal, halve each remaining move while legality holds
  for(let round=0;round<6;round++){
   let any=false;
   units.forEach((u,i)=>{
    const m=moves[i];if(Math.hypot(m.dx,m.dy)<.05)return;
    const dx=m.dx/2,dy=m.dy/2;
    const trial=units.map((q,k)=>k===i?{...q,center:[q.center[0]-dx,q.center[1]-dy],points:q.points.map(p=>[p[0]-dx,p[1]-dy])}:q);
    const gg=geomCheck({units:trial},boundary,trial.map(()=>true),sideGap);
    if(!gg.conflicts.length&&!gg.issues.length){units[i]=trial[i];m.dx-=dx;m.dy-=dy;any=true;}
   });
   if(!any)break;
  }
  const reference=units.map(u=>elevation(u.center[0],u.center[1],pts));
  const final=live();
  return {units:units.map((u,i)=>({...u,reference:reference[i]})),moves,
          remaining:final.issues,ok:!final.issues.length};
 }
 return {MAX,simplify,buildFromContours,samples,elevation,downhill,apply,diff,volume,polyDist,pointInPoly,geomCheck,orientationError,fitLayout,SIDE_GAP};
})();
if(typeof module!=='undefined')module.exports=TerrainEdit;
