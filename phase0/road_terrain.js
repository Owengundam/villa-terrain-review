/* Continuous, piecewise-linear reference for road studies, not a grading design.
 * Accepted contour vertices + samples at <=2 m retain their labelled elevations.
 * Linear interpolation inside a Delaunay triangle cannot create jumps when the
 * nearest contour pair changes. Outside the sample hull remains unknown.
 */
const RoadTerrain=(()=>{
 const D=typeof module!=='undefined'&&module.exports?require('delaunator'):Delaunator;
 function reference(contours){
  if(!Array.isArray(contours)||contours.length<2)throw Error('Accepted terrain contours are required for road slope checks.');
  const byXY=new Map();
  function add(x,y,z){
   if(![x,y,z].every(Number.isFinite))throw Error('Invalid terrain coordinate or elevation.');
   x=Number(x.toFixed(6));y=Number(y.toFixed(6));const key=x+','+y,previous=byXY.get(key);
   if(previous&&Math.abs(previous[2]-z)>0.0001)throw Error('Conflicting contour elevations at the same position.');
   byXY.set(key,[x,y,z]);
  }
  for(const c of contours){
   if(!Array.isArray(c.points)||c.points.length<2)throw Error('A terrain contour has insufficient points.');
   for(let i=0;i<c.points.length-1;i++){const a=c.points[i],b=c.points[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));
    for(let j=0;j<n;j++)add(a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n,c.z);}
   const p=c.points.at(-1);add(p[0],p[1],c.z);
  }
  const points=[...byXY.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),mesh=D.from(points),triangles=[],bins=new Map(),cell=16;
  for(let i=0;i<mesh.triangles.length;i+=3){
   const a=points[mesh.triangles[i]],b=points[mesh.triangles[i+1]],c=points[mesh.triangles[i+2]];
   const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],det=bx*cy-by*cx;
   if(Math.abs(det)<1e-12)continue;
   const t={a,b,c,bx,by,cx,cy,det},id=triangles.length;triangles.push(t);
   for(let x=Math.floor(Math.min(a[0],b[0],c[0])/cell);x<=Math.floor(Math.max(a[0],b[0],c[0])/cell);x++)
    for(let y=Math.floor(Math.min(a[1],b[1],c[1])/cell);y<=Math.floor(Math.max(a[1],b[1],c[1])/cell);y++){
     const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(id);}
  }
  if(!triangles.length)throw Error('Terrain contours do not span a usable surface.');
  function zAt(x,y){
   for(const id of bins.get(Math.floor(x/cell)+','+Math.floor(y/cell))||[]){const t=triangles[id],dx=x-t.a[0],dy=y-t.a[1],u=(dx*t.cy-dy*t.cx)/t.det,v=(t.bx*dy-t.by*dx)/t.det;
    if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9)return t.a[2]+u*(t.b[2]-t.a[2])+v*(t.c[2]-t.a[2]);}
   return null;
  }
  return {zAt,source:'Continuous linear triangle surface from accepted contour samples (2 m maximum spacing); outside hull unresolved',pointCount:points.length,triangleCount:triangles.length};
 }
 return {reference};
})();
if(typeof module!=='undefined')module.exports=RoadTerrain;
