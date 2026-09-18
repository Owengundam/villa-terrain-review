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
 function apply(data,lines){
  const pts=samples(lines);
  return data.layouts.map(l=>({...l,units:l.units.map(u=>{
   const view=downhill(u.center,pts,u.view);
   // Coupled orientation: rotate the footprint with the view so the long axis stays
   // perpendicular to the local contour, facing downhill (mandatory planning rule).
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
 return {MAX,simplify,buildFromContours,samples,elevation,downhill,apply,diff};
})();
if(typeof module!=='undefined')module.exports=TerrainEdit;
