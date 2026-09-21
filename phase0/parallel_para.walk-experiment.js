/* parallelPara — procedural initial population, rebuilt around an explicit row system.
 *
 *   Terrain/settings -> Populate (this module) -> inspect -> 3D view fitting (separate stage)
 *
 * Adopted geometry (PROJECT_GUIDE/DECISIONS_AND_HANDOFF.md): footprint 11 m wide (the axis
 * that runs along a row) x 23 m deep (front/back = viewing direction); the front is the
 * downhill end; an 11 x backClear rear exclusion strip sits immediately behind the rear
 * facade, rotated with the villa; the side rule is the adopted directional clearance; every
 * footprint lies fully inside the boundary (concave-safe) and overlaps no other footprint.
 *
 * Pipeline: settings() -> buildField() -> buildGuides() -> placeRow() -> generateLayout()
 * (bounded deterministic search + row-based gap recovery) -> metrics() -> validate().
 *
 * Guidance and physics are deliberately separate: the SMOOTHED contours decide the preferred
 * axis and where rows run; the UNSMOOTHED accepted contours decide which end is downhill
 * (front-vs-back ground drop over the full 23 m depth). Smoothing never moves a reference
 * elevation and is always recomputed from the source it is handed.
 */
const ParallelPara=(()=>{
 'use strict';
 const VILLA={width:11,depth:23};
 const DEFAULTS={sideGap:3,backClear:7,perpTol:15,margin:1.0,eps:1e-6,stationStep:3,cell:10,guideSmooth:16,maxFold:0.9,maxTurnDeg:60};

 /* ---------------- settings ---------------- */
 /* Validate the selected inputs. Absent keys take the adopted default; keys present but
    empty, non-numeric or out of range are ERRORS, so a cleared clearance field can never
    silently become 0. Pitches are derived from the parameters (never a hard-coded
    15/33/66): along = width + sideGap + margin, across = depth + backClear + margin.
    `margin` is an implementation choice (a construction margin that makes the strict
    inequalities hold numerically), not an adopted planning metric. */
 function settings(input){
  const i=input||{},errors=[];
  const read=(k,label,def,min,max)=>{
   /* an ABSENT key takes the adopted default; a key that is present but empty, null,
      non-numeric or out of range is an error, so a cleared clearance field can never
      silently become 0 (or quietly fall back to the default either) */
   const has=Object.prototype.hasOwnProperty.call(i,k)&&i[k]!==undefined;
   if(!has){if(def===undefined){errors.push(label+' is required');return NaN;}return def;}
   const raw=i[k];
   if(raw===null||raw===''){errors.push(label+' is empty — enter a number');return NaN;}
   const n=Number(raw);
   if(!Number.isFinite(n)){errors.push(label+' must be a number');return NaN;}
   if(n<min||n>max){errors.push(label+' must be between '+min+' and '+max);return NaN;}
   return n;};
  const v={
  sideGap:read('sideGap','Min side clearance',DEFAULTS.sideGap,0,30),
  backClear:read('backClear','Backhouse clearance',DEFAULTS.backClear,0,30),
  perpTol:read('perpTol','Perpendicular tolerance',DEFAULTS.perpTol,0,90),
  margin:read('margin','construction margin',DEFAULTS.margin,0.01,10),
  width:read('width','villa width',VILLA.width,1,60),
  depth:read('depth','villa depth',VILLA.depth,1,60),
  /* implementation choices, not planning metrics (see generateLayout's report for the
     evidence behind their defaults) */
  guideSmooth:read('guideSmooth','guide smoothing (stations)',DEFAULTS.guideSmooth,0,60),
  maxFold:read('maxFold','offset fold limit',DEFAULTS.maxFold,0.3,3),
  maxTurnDeg:read('maxTurnDeg','row turn limit (deg)',DEFAULTS.maxTurnDeg,15,180),
  eps:DEFAULTS.eps,stationStep:DEFAULTS.stationStep,cell:DEFAULTS.cell};
  v.alongPitch=v.width+v.sideGap+v.margin;
  v.acrossPitch=v.depth+v.backClear+v.margin;
  return {values:v,errors,ok:!errors.length};
 }

 /* ---------------- geometry primitives ---------------- */
 function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
 function pointInPoly(p,poly){let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
   if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi))inside=!inside;}
  return inside;}
 function ptPolyDist(p,poly){let best=Infinity;
  for(let k=0;k<poly.length;k++)best=Math.min(best,segDist(p,poly[k],poly[(k+1)%poly.length]));
  return best;}
 function polyDist(p1,p2){
  for(const p of p1)if(ptPolyDist(p,p2)===0)return 0;
  for(const p of p2)if(ptPolyDist(p,p1)===0)return 0;
  let best=Infinity;
  for(const p of p1)best=Math.min(best,ptPolyDist(p,p2));
  for(const p of p2)best=Math.min(best,ptPolyDist(p,p1));
  return best;}
 function rotatePoints(points,center,ang){
  const c=Math.cos(ang),s=Math.sin(ang);
  return points.map(p=>{const dx=p[0]-center[0],dy=p[1]-center[1];return [center[0]+dx*c-dy*s,center[1]+dx*s+dy*c];});}
 function rotate(v,a){const c=Math.cos(a),s=Math.sin(a);return [v[0]*c-v[1]*s,v[0]*s+v[1]*c];}
 function rect(center,view,w,d){
  const side=[view[1],-view[0]];
  return [[-w/2*side[0]-d/2*view[0],-w/2*side[1]-d/2*view[1]],
          [w/2*side[0]-d/2*view[0],w/2*side[1]-d/2*view[1]],
          [w/2*side[0]+d/2*view[0],w/2*side[1]+d/2*view[1]],
          [-w/2*side[0]+d/2*view[0],-w/2*side[1]+d/2*view[1]]].map(p=>[center[0]+p[0],center[1]+p[1]]);}
 function rectangle(center,view,w,d){
  return rect(center,view,arguments.length>2?w:VILLA.width,arguments.length>3?d:VILLA.depth);}
 function segCross(a,b,c,d){
  const cr=(o,p,q)=>(p[0]-o[0])*(q[1]-o[1])-(p[1]-o[1])*(q[0]-o[0]);
  const d1=cr(a,b,c),d2=cr(a,b,d),d3=cr(c,d,a),d4=cr(c,d,b);
  return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));}
 function polysOverlap(a,b){
  for(let i=0;i<a.length;i++){const a1=a[i],a2=a[(i+1)%a.length];
   for(let j=0;j<b.length;j++){const b1=b[j],b2=b[(j+1)%b.length];
    if(segCross(a1,a2,b1,b2))return true;}}
  if(a.some(p=>pointInPoly(p,b)))return true;
  if(b.some(p=>pointInPoly(p,a)))return true;
  return false;}
 /* Concave-safe containment. Vertices alone are not enough: a footprint edge can leave and
    re-enter a concave boundary between two inside vertices, so we also require that no
    footprint edge properly crosses a boundary edge, that every edge midpoint is inside, and
    that no boundary vertex lies strictly inside the footprint. */
 function polyInsideBoundary(poly,boundary){
  if(!boundary||boundary.length<3)return true;
  for(const p of poly)if(!pointInPoly(p,boundary))return false;
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length];
   for(let j=0;j<boundary.length;j++){
    const c=boundary[j],d=boundary[(j+1)%boundary.length];
    if(segCross(a,b,c,d))return false;}
   if(!pointInPoly([(a[0]+b[0])/2,(a[1]+b[1])/2],boundary))return false;}
  for(const c of boundary)if(pointInPoly(c,poly))return false;
  return true;}
 /* ---------------- elevation / guidance field ---------------- */
 /* Built from contour polylines only. zAt() brackets the two nearest DISTINCT levels and
    interpolates linearly between them, so the field is monotone between two contour lines
    and no dip appears between them. normalAt() averages the tangents of the nearest
    same-level segments (small radius, so a row does not chase single-vertex zigzags) and
    orients the normal toward the higher terrain. facing() returns that uphill normal plus
    the downhill-ward direction (the preferred facing). */
 function buildField(lines,par){
  const cell=(par&&par.cell)||DEFAULTS.cell,segs=[],grid=new Map();
  for(const l of lines||[]){
   const pts=l.points||l.controls||[];
   for(let i=0;i+1<pts.length;i++){
    const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
    if(len<1e-9)continue;
    segs.push({a,b,z:l.z,len,tx:dx/len,ty:dy/len});}}
  segs.forEach((s,idx)=>{
   const x0=Math.min(s.a[0],s.b[0]),x1=Math.max(s.a[0],s.b[0]);
   const y0=Math.min(s.a[1],s.b[1]),y1=Math.max(s.a[1],s.b[1]);
   for(let i=Math.floor(x0/cell);i<=Math.floor(x1/cell);i++)for(let j=Math.floor(y0/cell);j<=Math.floor(y1/cell);j++){
    const k=i+','+j;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(idx);}});
  function segmentDist(s,x,y){
   const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1];
   const t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(y-s.a[1])*dy)/(dx*dx+dy*dy||1)));
   return Math.hypot(x-(s.a[0]+t*dx),y-(s.a[1]+t*dy));}
  /* Segments near a point, by ring expansion that STOPS once the nearest segment is settled and
     a small neighbourhood is in hand (capped by `limit`). The guidance field is dense — marching
     squares puts a vertex every couple of metres — so scanning a fixed 12 m radius would touch
     hundreds of segments per call, and this is the hot path of every walk step. */
  function nearSegments(x,y,radius,limit){
   const ci=Math.floor(x/cell),cj=Math.floor(y/cell),rings=Math.ceil(radius/cell),out=[],seen=new Set();
   const cap=limit||24;
   for(let r=0;r<=rings;r++){
    for(let i=ci-r;i<=ci+r;i++)for(let j=cj-r;j<=cj+r;j++){
     if(Math.max(Math.abs(i-ci),Math.abs(j-cj))!==r)continue;
     const list=grid.get(i+','+j);
     if(!list)continue;
     for(const idx of list){
      if(seen.has(idx))continue;
      seen.add(idx);
      const s=segs[idx],d=segmentDist(s,x,y);
      if(d<=radius)out.push({s,d});}}
    if(out.length){
     out.sort((a,b)=>a.d-b.d);
     if(out.length>=cap)break;
     if(r*cell>=out[0].d+3)break;}}
   if(out.length>cap)out.length=cap;
   return out;}
  /* Nearest segment per level, expanding rings only as far as needed: the search stops as
     soon as the two nearest DISTINCT levels are bracketed (the ring radius has passed the
     second level's distance), which keeps elevation reads cheap — they are the hot path in
     placement, where thousands of candidate positions are tested. */
  function nearestLevels(x,y,maxRadius){
   const ci=Math.floor(x/cell),cj=Math.floor(y/cell),best=new Map(),seen=new Set();
   const rings=Math.ceil((maxRadius===undefined?80:maxRadius)/cell);
   for(let r=0;r<=rings;r++){
    for(let i=ci-r;i<=ci+r;i++)for(let j=cj-r;j<=cj+r;j++){
     if(Math.max(Math.abs(i-ci),Math.abs(j-cj))!==r)continue;
     const list=grid.get(i+','+j);
     if(!list)continue;
     for(const idx of list){
      if(seen.has(idx))continue;
      seen.add(idx);
      const s=segs[idx],d=segmentDist(s,x,y),key=s.z.toFixed(3);
      if(!best.has(key)||best.get(key).d>d)best.set(key,{z:s.z,d});}}
    if(best.size>=2){
     const arr=[...best.values()].sort((a,b)=>a.d-b.d);
     const z1=arr[0].z;
     let second=null;
     for(const v of arr)if(Math.abs(v.z-z1)>0.01){second=v;break;}
     if(second&&r*cell>=second.d)break;}}
   return [...best.values()].sort((a,b)=>a.d-b.d);}
  function zAt(x,y){
   const lv=nearestLevels(x,y,80);
   if(!lv.length)return null;
   const z1=lv[0].z,d1=lv[0].d;
   let other=null;
   for(let i=1;i<lv.length;i++)if(Math.abs(lv[i].z-z1)>0.01){other=lv[i];break;}
   if(!other)return z1;
   if(d1+other.d<1e-9)return z1;
   return z1+(other.z-z1)*(d1/(d1+other.d));}
  function tangentAt(x,y,radius){
   let near=nearSegments(x,y,radius===undefined?12:radius);
   if(!near.length){                      // sparse contours: widen the window instead of giving up
    for(const r of [24,48,80]){
     near=nearSegments(x,y,r);
     if(near.length)break;}}
   if(!near.length)return null;
   const z0=near[0].s.z;
   let sx=near[0].s.tx,sy=near[0].s.ty,tx=near[0].s.tx,ty=near[0].s.ty;
   const w0=1/(near[0].d+0.5);sx*=w0;sy*=w0;
   for(let i=1;i<near.length;i++){
    const s=near[i].s;
    if(Math.abs(s.z-z0)>0.01)break;
    let dx=s.tx,dy=s.ty;
    if(dx*tx+dy*ty<0){dx=-dx;dy=-dy;}
    const w=1/(near[i].d+0.5);sx+=dx*w;sy+=dy*w;}
   const m=Math.hypot(sx,sy);
   return m<1e-9?null:[sx/m,sy/m];}
  function normalAt(x,y){
   const t=tangentAt(x,y);
   if(!t)return null;
   let n=[-t[1],t[0]];
   const here=zAt(x,y);
   if(here!==null){
    const up=zAt(x+n[0]*3,y+n[1]*3);
    if(up!==null&&up<here)n=[-n[0],-n[1]];}
   return n;}
  function facing(x,y){
   const n=normalAt(x,y);
   return n?{uphill:n,downhill:[-n[0],-n[1]]}:null;}
  return {segs,grid,segmentDist,nearSegments,nearestLevels,zAt,tangentAt,normalAt,facing};}
 /* Front-vs-back ground drop over the FULL depth (established physical check — not a point
    gradient), sampled at three lateral offsets across the footprint and averaged. Positive
    drop = the front end is lower = the villa faces downhill. */
 function groundDrop(field,center,view,depth,width){
  if(!field||!field.zAt)return {drop:null,ok:false,samples:0};
  const side=[view[1],-view[0]],half=depth/2,lat=[-width/4,0,width/4];
  let sum=0,n=0,front=null,rear=null;
  for(const l of lat){
   const bx=center[0]+side[0]*l,by=center[1]+side[1]*l;
   const fz=field.zAt(bx+view[0]*half,by+view[1]*half);
   const rz=field.zAt(bx-view[0]*half,by-view[1]*half);
   if(fz===null||rz===null)continue;
   sum+=rz-fz;n++;
   if(front===null)front=fz;
   if(rear===null)rear=rz;}
  if(!n)return {drop:null,ok:false,samples:0};
  const drop=sum/n;
  return {drop,ok:drop>0,front,rear,samples:n};}
 /* ---------------- clearance predicates ---------------- */
 /* Rear exclusion strip: 11 x clear rectangle immediately behind the rear facade, rotated
    with the villa. Built from centre/view/width/depth — never from stored corners — so the
    footprint, the front arrow and the strip cannot drift apart. */
 function rearStrip(u,clear){
  const v=u.view,side=[v[1],-v[0]];
  const w=(u.width||VILLA.width)/2,d=(u.depth||VILLA.depth)/2;
  const rA=[u.center[0]-v[0]*d-side[0]*w,u.center[1]-v[1]*d-side[1]*w];
  const rB=[u.center[0]-v[0]*d+side[0]*w,u.center[1]-v[1]*d+side[1]*w];
  return [rA,rB,[rB[0]-v[0]*clear,rB[1]-v[1]*clear],[rA[0]-v[0]*clear,rA[1]-v[1]*clear]];}
 function stripIntrusion(strip,poly){
  for(const p of strip)if(pointInPoly(p,poly))return true;
  for(const p of poly)if(pointInPoly(p,strip))return true;
  return polysOverlap(strip,poly);}
 /* B's footprint vs A's strip and A's footprint vs B's strip — both directions are always
    checked. Returns 'A' when the FIRST villa's strip was entered, 'B' when the second's was,
    or null (the value is positional: it names which strip, not which villa intruded). Rear
    strips MAY overlap each other; this is not a 14 m separation and not an all-round setback,
    and the strip is not required to lie inside the site. */
 function rearConflict(a,b,clear){
  if(stripIntrusion(rearStrip(a,clear),b.points))return 'A';
  if(stripIntrusion(rearStrip(b,clear),a.points))return 'B';
  return null;}
 /* Adopted directional side clearance. Two footprints are side-clear when EITHER holds, with
    a strict margin:
      (a) their plain polygon distance exceeds the gap, or
      (b) their projections onto at least ONE of the two villas' own side axes are separated
          by more than the gap (overlapping intervals give 0).
    (b) needs only one frame on purpose: on a curved row the two frames legitimately disagree
    (each villa measures against its own heading), and requiring both is the older, overly
    restrictive rule that discarded valid curved-row pairs.
    RELATIONSHIP between the two: a projection gap along any axis is a lower bound on the true
    set distance, so (b) can never hold when (a) fails. The union therefore accepts exactly the
    pairs whose footprints are more than `gap` apart, and the directional statement is what
    explains WHY a curved-row pair passes (one frame reads 2.5 m while the footprints are 3.4 m
    apart). Both measurements are returned so callers can report the reason, and the exact
    threshold matters: 3.000 m fails, 3.001 m passes. */
 function sideClearance(a,b,gap,eps){
  const e=eps===undefined?DEFAULTS.eps:eps;
  /* both measurements are always computed, even when the plain distance already settles it,
     so a report can explain WHY a pair passed (this is the number that shows a curved row
     reading 2.5 m in one frame while its footprints are 3.4 m apart) */
  const out={ok:false,gap,polyGap:polyDist(a.points,b.points),sep:[]};
  for(const u of [a,b]){
   const v=u.view,side=[v[1],-v[0]];
   const proj=p=>(p[0]-u.center[0])*side[0]+(p[1]-u.center[1])*side[1];
   const pa=a.points.map(proj),pb=b.points.map(proj);
   const aMin=Math.min.apply(null,pa),aMax=Math.max.apply(null,pa);
   const bMin=Math.min.apply(null,pb),bMax=Math.max.apply(null,pb);
   out.sep.push(Number(Math.max(aMin-bMax,bMin-aMax).toFixed(3)));}
  out.ok=out.polyGap>gap+e||out.sep.some(s=>s>gap+e);
  return out;}
 function sideGapOK(a,b,gap,tol){return sideClearance(a,b,gap===undefined?DEFAULTS.sideGap:gap,tol).ok;}
 /* ---------------- row guides ---------------- */
 /* Exact arc-length stations along a polyline. Every offset, phase and placement is measured
    on this sampling, never by snapping to whichever contour vertex happens to be nearby. */
 function stations(points,step){
  const st=step||DEFAULTS.stationStep;
  if(!points||points.length<2)return [];
  const out=[{x:points[0][0],y:points[0][1],s:0}];
  let acc=0,next=st;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
   if(len<1e-9)continue;
   const ux=dx/len,uy=dy/len,segStart=acc,segEnd=acc+len;
   while(next<=segEnd+1e-9){
    const d=next-segStart;
    out.push({x:a[0]+ux*d,y:a[1]+uy*d,s:next});
    next+=st;}
   acc=segEnd;}
  const last=points[points.length-1];
  if(out[out.length-1].s<acc-1e-9)out.push({x:last[0],y:last[1],s:acc});
  return out;}
 /* Discrete curvature (1/m) at each station, measured over a ±w station BASELINE (default
    4 stations = ~24 m). A one-step curvature on a traced contour is dominated by
    vertex-level noise, and the offset fold test (|dist| * curvature) would then cut nearly
    every real row; over a 24 m baseline only genuine folds trip it. */
 function curvature(list,w){
  const W=w===undefined?4:w;
  for(let i=0;i<list.length;i++){
   const a=list[Math.max(0,i-W)],b=list[Math.min(list.length-1,i+W)];
   let k=0;
   if(a!==list[i]&&b!==list[i]){
    const v1=[list[i].x-a.x,list[i].y-a.y],v2=[b.x-list[i].x,b.y-list[i].y];
    const m1=Math.hypot(v1[0],v1[1]),m2=Math.hypot(v2[0],v2[1]);
    if(m1>1e-9&&m2>1e-9){
     const cross=(v1[0]*v2[1]-v1[1]*v2[0])/(m1*m2);
     k=Math.abs(Math.asin(Math.max(-1,Math.min(1,cross))))/((m1+m2)/2);}}
   list[i].curv=k;}
  return list;}
 /* Low-pass the spine positions (moving average over ±w stations, default 8 ≈ 24 m) and
    re-measure arc length. This is the "broad, smoothed terrain structure" the rows are
    derived from: a traced contour carries metre-scale wiggles that are irrelevant to
    building rows, and offsetting the raw polyline folds at every one of them. */
 function smoothPath(list,w){
  const W=w===undefined?8:w,n=list.length;
  if(n<3)return list.map(p=>Object.assign({},p));
  const out=[];
  for(let i=0;i<n;i++){
   let sx=0,sy=0,c=0;
   for(let j=Math.max(0,i-W);j<=Math.min(n-1,i+W);j++){sx+=list[j].x;sy+=list[j].y;c++;}
   out.push({x:sx/c,y:sy/c,s:0});}
  let acc=0;
  for(let i=1;i<n;i++){acc+=Math.hypot(out[i].x-out[i-1].x,out[i].y-out[i-1].y);out[i].s=acc;}
  return out;}
 /* Tangent and uphill-oriented normal at every station of a spine, from a WINDOW of
    neighbouring stations (±win): the traced contours carry vertex-level noise, and a
    one-step tangent turns sharply at every wiggle, which would fragment rows and jitter the
    headings. The normal is oriented by the field (toward higher ground), so offsetting does
    not depend on the input point order — a reversed or shuffled contour yields the same
    guides. */
 function spineNormals(list,field,win){
  const W=win===undefined?3:win;
  for(let i=0;i<list.length;i++){
   const a=list[Math.max(0,i-W)],b=list[Math.min(list.length-1,i+W)];
   let dx=b.x-a.x,dy=b.y-a.y;
   const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;
   let n=[-dy,dx];
   if(field&&field.zAt){
    const here=field.zAt(list[i].x,list[i].y),up=field.zAt(list[i].x+n[0]*3,list[i].y+n[1]*3);
    if(here!==null&&up!==null&&up<here)n=[-n[0],-n[1]];}
   list[i].tx=dx;list[i].ty=dy;list[i].nx=n[0];list[i].ny=n[1];}
  return list;}
 /* Offset a spine sideways (positive = uphill). The result is cut where the offset would fold
    (|dist| * curvature >= maxFold), where it leaves the boundary, and where it crosses
    itself — a row never loops into itself, never branches and never leaves the site. */
 function offsetStations(list,dist,opts){
  const o=opts||{},boundary=o.boundary,maxFold=o.maxFold===undefined?0.9:o.maxFold;
  const pieces=[];let cur=[];
  for(const p of list){
   const fold=p.curv!==undefined&&Math.abs(dist*p.curv)>=maxFold;
   const x=p.x+p.nx*dist,y=p.y+p.ny*dist;
   const outside=boundary&&boundary.length>=3&&!pointInPoly([x,y],boundary);
   if(fold||outside){if(cur.length>=2)pieces.push(cur);cur=[];continue;}
   cur.push({x,y,s:p.s,tx:p.tx,ty:p.ty});}
  if(cur.length>=2)pieces.push(cur);
  const out=[];
  for(const pc of pieces){
   const cuts=selfCuts(pc);let start=0;
   for(const c of cuts){
    if(c-start>=2)out.push(pc.slice(start,c));
    start=c;}
   if(pc.length-start>=2)out.push(pc.slice(start));}
  return out;}
 function selfCuts(pc){
  const cuts=[];
  for(let i=0;i+1<pc.length;i++)for(let j=i+2;j+1<pc.length;j++){
   if(i+1===j)continue;
   if(segCross([pc[i].x,pc[i].y],[pc[i+1].x,pc[i+1].y],[pc[j].x,pc[j].y],[pc[j+1].x,pc[j+1].y]))cuts.push(j);}
  return cuts;}
 function guidePointAt(g,s){
  const n=g.nodes;
  if(!n.length)return null;
  if(s<=n[0].s)return {x:n[0].x,y:n[0].y,tx:n[0].tx,ty:n[0].ty};
  const last=n[n.length-1];
  if(s>=last.s)return {x:last.x,y:last.y,tx:last.tx,ty:last.ty};
  let lo=0,hi=n.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(n[mid].s<=s)lo=mid;else hi=mid;}
  const a=n[lo],b=n[hi],seg=b.s-a.s,frac=seg>1e-9?(s-a.s)/seg:0;
  return {x:a.x+(b.x-a.x)*frac,y:a.y+(b.y-a.y)*frac,tx:a.tx+(b.tx-a.tx)*frac,ty:a.ty+(b.ty-a.ty)*frac};}
 function arcOf(g,u){
  let best=g.nodes.length?g.nodes[0].s:0,bd=Infinity;
  for(const n of g.nodes){const d=Math.hypot(n.x-u.center[0],n.y-u.center[1]);if(d<bd){bd=d;best=n.s;}}
  return best;}
 /* Cut a piece into separate rows where the terrain genuinely turns: the heading drifts more
    than maxTurn (implementation choice, default 60°) from the row's own starting heading.
    Gradual bending — the normal case on this hillside — is kept, and vertex noise does not
    trigger a split because the headings are window-averaged. */
 function splitByTurn(piece,par){
  const maxTurn=(par&&par.maxTurnDeg?par.maxTurnDeg:60)*Math.PI/180;
  const out=[];let start=0;
  for(let i=1;i<piece.length;i++){
   const dot=Math.max(-1,Math.min(1,piece[i].tx*piece[start].tx+piece[i].ty*piece[start].ty));
   if(Math.acos(dot)>maxTurn){
    if(i-start>=3)out.push(piece.slice(start,i));
    start=i;}}
  if(piece.length-start>=3)out.push(piece.slice(start));
  if(!out.length)out.push(piece);
  return out;}
 /* Build the row system: marching bands. Rows are walked across the site starting from its
    lowest point and stepping one across-row pitch (villaDepth + backClearance + margin)
    uphill band by band. Each row follows the LOCAL contour direction with momentum, so it
    bends gradually with the terrain, never folds, and never chases a single traced zigzag.
    A row is split where the terrain genuinely turns or where the band breaks; rows are
    trimmed where they converge on an already accepted row, so the bands keep a legal pitch
    without imposing one rigid global grid, and each region keeps its own direction. */
 function buildGuides(field,boundary,par,lines){
  /* The trim threshold is the LEGAL row separation (depth + rear clearance) less a small
     margin, deliberately a bit below the construction pitch: bands are laid one pitch apart,
     so a threshold equal to the pitch would trim them the moment the terrain direction
     wobbles by half a metre. Exact legality stays the placement's job, which measures real
     polygons and simply thins a row where the ground is not there. */
  const pitch=par.acrossPitch,minSep=par.depth+par.backClear-0.2,minRow=Math.max(par.alongPitch,16),
        step=par.stationStep;
  const stats={candidateLength:0,acceptedLength:0,trimmedLength:0,bands:0,seeds:0,walked:0,
   seedOutside:0,seedClose:0,seedNoNormal:0,bandInfo:[]};
  let previousSeedCount=1;
  if(!field.segs.length||boundary.length<3)return {guides:[],dropped:[],stats};
  const cell=Math.max(minSep,1),hash=new Map(),dropped=[];
  const addSample=(x,y)=>{const k=Math.floor(x/cell)+','+Math.floor(y/cell);if(!hash.has(k))hash.set(k,[]);hash.get(k).push([x,y]);};
  /* True distance to the nearest accepted row. A two-cell cap (~60 m) made every large hole
     report the same number, so recovery kept reseeding the lowest sliver instead of the
     empty lobes in the middle of the site. */
  const nearAccepted=(x,y)=>{
   const ci=Math.floor(x/cell),cj=Math.floor(y/cell);
   let best=Infinity;
   for(let i=ci-8;i<=ci+8;i++)for(let j=cj-8;j<=cj+8;j++){
    const l=hash.get(i+','+j);
    if(!l)continue;
    for(const p of l){
     const d=Math.hypot(p[0]-x,p[1]-y);
     if(d<best)best=d;}}
   return best;};
  const inside=(x,y)=>pointInPoly([x,y],boundary);
  /* one row: walk from `seed` along the local contour direction. Momentum is light so the
     walk tracks the contour instead of climbing into a diagonal that then fragments and
     blocks later bands. A damped elevation correction along the field normal holds the
     seed's level — a row is a contour, not a path that wanders uphill. Stops at the
     boundary and when it closes on itself. */
 function walkLine(seed,t0){
   const out=[];
   const z0=field.zAt(seed[0],seed[1]);
   let pos=[seed[0],seed[1]],dir=[t0[0],t0[1]],m0=Math.hypot(t0[0],t0[1])||1;
   dir=[dir[0]/m0,dir[1]/m0];
   for(let i=0;i<400;i++){
    if(!inside(pos[0],pos[1]))break;
    if(i>30&&Math.hypot(pos[0]-out[i-30].x,pos[1]-out[i-30].y)<step*1.5)break; // closed on itself
    out.push({x:pos[0],y:pos[1],s:i*step,tx:dir[0],ty:dir[1]});
    const n=field.normalAt(pos[0],pos[1]);
    let t=n?[-n[1],n[0]]:[dir[0],dir[1]];
    if(t[0]*dir[0]+t[1]*dir[1]<0)t=[-t[0],-t[1]];
    const nd=[dir[0]*0.25+t[0]*0.75,dir[1]*0.25+t[1]*0.75];
    const m=Math.hypot(nd[0],nd[1])||1;
    dir=[nd[0]/m,nd[1]/m];
    let cx=0,cy=0;
    const z=field.zAt(pos[0],pos[1]);
    if(n&&z0!==null&&z!==null){
     const zN=field.zAt(pos[0]+n[0]*3,pos[1]+n[1]*3);
     const slope=(zN!==null)?(zN-z)/3:0;
     if(Math.abs(slope)>0.005){
      const d=Math.max(-step*0.8,Math.min(step*0.8,-0.5*(z-z0)/slope));
      cx=n[0]*d;cy=n[1]*d;}}
    pos=[pos[0]+dir[0]*step+cx,pos[1]+dir[1]*step+cy];}
   for(let i=0;i<out.length;i++){
    const a=out[Math.max(0,i-2)],b=out[Math.min(out.length-1,i+2)];
    const dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy);
    if(m>1e-9){out[i].tx=dx/m;out[i].ty=dy/m;}}
   return out;}
  /* Walk a row that HOLDS the pitch against the row it came from. The plain terrain-following
     walk drifts into its neighbour on the inside of a bend (and away from it on the outside),
     which is what actually limits coverage on a curved hillside. At every step the walk
     follows the local contour direction but corrects its position toward/away from the parent
     row so the separation stays at the across-row pitch. */
  function walkOffset(prev,seed,dirInit){
   const out=[];
   let pos=[seed[0],seed[1]],dir=[dirInit[0],dirInit[1]];
   const m0=Math.hypot(dir[0],dir[1])||1;
   dir=[dir[0]/m0,dir[1]/m0];
   for(let i=0;i<400;i++){
    if(!inside(pos[0],pos[1]))break;
    if(i>30&&Math.hypot(pos[0]-out[i-30].x,pos[1]-out[i-30].y)<step*1.5)break;
    out.push({x:pos[0],y:pos[1],s:i*step,tx:dir[0],ty:dir[1]});
    let best=prev[0],bd=Infinity;
    for(let j=0;j<prev.length;j++){
     const d=Math.hypot(prev[j].x-pos[0],prev[j].y-pos[1]);
     if(d<bd){bd=d;best=prev[j];}}
    const ex=pos[0]-best.x,ey=pos[1]-best.y,em=Math.hypot(ex,ey)||1;
    const err=(pitch-bd)*0.5;                     // >0 means too close: push away from the parent
    const n=field.normalAt(pos[0],pos[1]);
    let t=n?[-n[1],n[0]]:[dir[0],dir[1]];
    if(t[0]*dir[0]+t[1]*dir[1]<0)t=[-t[0],-t[1]];
    const nd=[dir[0]*0.6+t[0]*0.4,dir[1]*0.6+t[1]*0.4];
    const nm=Math.hypot(nd[0],nd[1])||1;
    dir=[nd[0]/nm,nd[1]/nm];
    pos=[pos[0]+dir[0]*step+ex/em*err,pos[1]+dir[1]*step+ey/em*err];}
   return finalizeLine(out);}
  const lineLen=list=>list.length?list[list.length-1].s-list[0].s:0;
  /* arc length and windowed tangents of a merged walk (the two halves each carry their own
     step counter, so the join must be re-measured before anything reads s) */
  function finalizeLine(list){
   let acc=0;
   for(let i=1;i<list.length;i++){acc+=Math.hypot(list[i].x-list[i-1].x,list[i].y-list[i-1].y);list[i].s=acc;}
   if(list.length)list[0].s=0;
   for(let i=0;i<list.length;i++){
    const a=list[Math.max(0,i-2)],b=list[Math.min(list.length-1,i+2)];
    const dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy);
    if(m>1e-9){list[i].tx=dx/m;list[i].ty=dy/m;}}
   return list;}
  function mergeWalk(fwd,back){return finalizeLine((back.slice(1).reverse()).concat(fwd));}
  /* Several first-band seeds across the lowest elevation, not one corner. A single toe-of-slope
     seed leaves whole lobes of the site unexplored because later bands only grow from it. */
  let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;
  for(const p of boundary){bx0=Math.min(bx0,p[0]);by0=Math.min(by0,p[1]);bx1=Math.max(bx1,p[0]);by1=Math.max(by1,p[1]);}
  const seedCandidates=[];
  for(let x=bx0;x<=bx1;x+=8)for(let y=by0;y<=by1;y+=8){
   if(!inside(x,y))continue;
   const z=field.zAt(x,y);
   if(z===null)continue;
   seedCandidates.push({z,x,y});}
  seedCandidates.sort((a,b)=>a.z-b.z||a.x-b.x||a.y-b.y);
  /* One family per across-row pitch in elevation, not a single toe seed that marches
     until it stalls. On this hillside ~1 m of fall is already one 31 m pitch, so a +8 m
     "first band" was the whole site as mixed fragments. Each slice walks its own contour
     level; keepPieces drops slices that land closer than the legal row separation. */
  let slopeSum=0,slopeN=0;
  const stride=Math.max(1,Math.floor(seedCandidates.length/40));
  for(let i=0;i<seedCandidates.length;i+=stride){
   const c=seedCandidates[i],n=field.normalAt(c.x,c.y);
   if(!n)continue;
   const z2=field.zAt(c.x+n[0]*pitch,c.y+n[1]*pitch);
   if(z2===null)continue;
   slopeSum+=Math.abs(z2-c.z);slopeN++;}
  const dz=slopeN?Math.max(0.35,Math.min(3.5,slopeSum/slopeN)):1;
  const zMin=seedCandidates[0].z,zMax=seedCandidates[seedCandidates.length-1].z;
  const accepted=[];
  let family=0;
  for(let z=zMin;z<=zMax+1e-6;z+=dz){
   stats.bands++;
   const bandRows=[],sliceSeeds=[];
   for(const c of seedCandidates){
    if(Math.abs(c.z-z)>dz*0.45)continue;
    if(!wellBracketed(c.x,c.y))continue;
    if(sliceSeeds.some(s=>Math.hypot(s[0]-c.x,s[1]-c.y)<70))continue;
    const n=field.normalAt(c.x,c.y);
    const t=n?[-n[1],n[0]]:[1,0];
    const probed=mergeWalk(walkLine([c.x,c.y],t),walkLine([c.x,c.y],[-t[0],-t[1]]));
    if(lineLen(probed)<Math.max(minRow,pitch*0.8))continue;
    sliceSeeds.push([c.x,c.y]);
    if(sliceSeeds.length>=6)break;}
   for(const seed of sliceSeeds){
    const n=field.normalAt(seed[0],seed[1]);
    const t=n?[-n[1],n[0]]:[1,0];
    const line=mergeWalk(walkLine(seed,t),walkLine(seed,[-t[0],-t[1]]));
    if(line.length<3)continue;
    stats.walked++;
    keepPieces(line,family,{offset:family*pitch,into:bandRows});}
   stats.bandInfo.push({band:family,seedsIn:sliceSeeds.length,rows:bandRows.length,
    length:Number(bandRows.reduce((s,r)=>s+lineLen(r),0).toFixed(1)),seedsOut:0});
   previousSeedCount=sliceSeeds.length;
   family++;}
  if(!accepted.length)return {guides:[],dropped,stats};
  /* A 21 m edge sliver cannot host a 23 m-deep villa, but it still poisons ~30 m around
     itself and blocks an inland row that could. Probe a few stations before accepting. */
  /* Skip the IDW halo past the last contour — inverse-distance z there inverts the
     slope, so a villa would "face downhill" up the hill. A station is usable only
     when two distinct levels sit within one across-row pitch. */
  function wellBracketed(x,y){
   const lv=field.nearestLevels(x,y,Math.max(80,pitch*2));
   if(!lv||lv.length<2)return false;
   const z1=lv[0].z;
   let second=null;
   for(const v of lv)if(Math.abs(v.z-z1)>0.01){second=v;break;}
   return !!(second&&lv[0].d<pitch&&second.d<pitch*1.5);}
  function pieceUsable(part){
   if(!part||part.length<3)return false;
   const g={nodes:part},lo=part[0].s,hi=part[part.length-1].s;
   if(hi-lo<par.width)return false;
   for(const f of [0.25,0.5,0.75]){
    const q=guidePointAt(g,lo+(hi-lo)*f);
    if(!q)continue;
    if(!wellBracketed(q.x,q.y))continue;
    const n=field.normalAt(q.x,q.y);
    const down=n?[-n[0],-n[1]]:[q.ty,-q.tx];
    if(!polyInsideBoundary(rect([q.x,q.y],down,par.width,par.depth),boundary))continue;
    if(groundDrop(field,[q.x,q.y],down,par.depth,par.width).ok)return true;}
   return false;}
  function seedsFrom(row){
   const stride=Math.max(2,Math.round(pitch/step)),out=[];
   for(let i=0;i<row.length;i+=stride){
    const p=row[i],q=field.normalAt(p.x,p.y);
    if(!q){stats.seedNoNormal++;continue;}
    const next=[p.x+q[0]*pitch,p.y+q[1]*pitch];
    if(!inside(next[0],next[1])){stats.seedOutside++;continue;}
    /* the next band sits exactly one pitch from this one by construction, so the filter only
       has to reject a seed that would duplicate an existing row — not enforce the pitch */
    if(nearAccepted(next[0],next[1])<pitch*0.5){stats.seedClose++;continue;}
    out.push({p:next,parent:row,dir:[row[i].tx,row[i].ty]});}
   return out;}
  /* Farthest-point hole filling: keep walking a new row from the site sample that is
     farthest from any accepted guide, until every interior sample sits inside the legal
     row pitch or the try budget is spent. Elevation-order walking with a 60 m cap left the
     big empty lobes untouched (R04/R06-style edge slivers got the walks instead). */
  function keepPieces(line,family,opts){
   const o=opts||{};
   stats.candidateLength+=lineLen(line);
   let run=[],closeRun=0,gained=false;
   const kept=[];
   for(const p of line){
    const d=nearAccepted(p.x,p.y);
    closeRun=d<minSep?closeRun+1:0;
    if(closeRun>=2){if(run.length>=3)kept.push(run);run=[];continue;}
    run.push(p);}
   if(run.length>=3)kept.push(run);
   for(const seg of kept)for(const part0 of splitByTurn(seg,par)){
    const part=canonicalNodes(part0);
    const len=lineLen(part);
    const mid=part[Math.floor(part.length/2)];
    if(len<minRow||nearAccepted(mid.x,mid.y)<minSep||!pieceUsable(part)){stats.trimmedLength+=len;continue;}
    for(const p of part)addSample(p.x,p.y);
    accepted.push({family,level:field.zAt(part[0].x,part[0].y),offset:o.offset||0,nodes:part,length:len,recovered:!!o.recovered});
    if(o.into)o.into.push(part);
    gained=true;}
   return gained;}
  const gridStep=Math.max(8,Math.round(pitch*0.4));
  const holeGrid=[];
  for(let x=bx0;x<=bx1;x+=gridStep)for(let y=by0;y<=by1;y+=gridStep){
   if(!inside(x,y))continue;
   if(field.zAt(x,y)===null)continue;
   holeGrid.push({x,y});}
  const inset=4;
  for(let k=0;k<80;k++){
   let best=null,bestD=-1,bestI=-1;
   for(let i=0;i<holeGrid.length;i++){
    const g=holeGrid[i],d=nearAccepted(g.x,g.y);
    if(d<minSep||d<=bestD)continue;
    if(ptPolyDist([g.x,g.y],boundary)<inset)continue;
    bestD=d;best=g;bestI=i;}
   if(!best)break;
   holeGrid.splice(bestI,1);
   stats.recoveryTries=(stats.recoveryTries||0)+1;
   const n=field.normalAt(best.x,best.y);
   const t=n?[-n[1],n[0]]:[1,0];
   const line=mergeWalk(walkLine([best.x,best.y],t),walkLine([best.x,best.y],[-t[0],-t[1]]));
   if(line.length<3){stats.recoveryFailed=(stats.recoveryFailed||0)+1;continue;}
   const grown=[];
   if(keepPieces(line,900+k,{recovered:true,into:grown})){
    stats.recoveredRows=(stats.recoveredRows||0)+1;
    /* a recovered row in a hanging lobe used to sit alone; march uphill from it so the
       rest of that lobe gets a family, not a single fragment */
    let growSeeds=[];
    for(const row of grown)for(const s of seedsFrom(row))growSeeds.push(s);
    for(let b=0;b<40&&growSeeds.length;b++){
     const next=[];
     for(const s of growSeeds){
      const nn=field.normalAt(s.p[0],s.p[1]);
      const tt=nn?[-nn[1],nn[0]]:[1,0];
      const ln=mergeWalk(walkLine(s.p,tt),walkLine(s.p,[-tt[0],-tt[1]]));
      if(ln.length<3)continue;
      const into=[];
      keepPieces(ln,900+k+b+1,{recovered:true,into});
      for(const row of into)for(const ns of seedsFrom(row))next.push(ns);}
     growSeeds=next;}}
   else{
    stats.recoveryFailed=(stats.recoveryFailed||0)+1;
    for(let i=holeGrid.length-1;i>=0;i--)
     if(Math.hypot(holeGrid[i].x-best.x,holeGrid[i].y-best.y)<minSep)holeGrid.splice(i,1);}}
  accepted.sort((a,b)=>a.family-b.family||a.nodes[0].x-b.nodes[0].x||a.nodes[0].y-b.nodes[0].y);
  accepted.forEach((g,i)=>{
   g.id='R'+String(i+1).padStart(2,'0');
   let sx=0,sy=0;
   for(const n of g.nodes){sx+=n.tx;sy+=n.ty;}
   const m=Math.hypot(sx,sy);
   g.famAxis=m>1e-9?[sx/m,sy/m]:null;
   g.length=lineLen(g.nodes);});
  stats.acceptedLength=Number(accepted.reduce((s,g)=>s+g.length,0).toFixed(1));
  stats.candidateLength=Number(stats.candidateLength.toFixed(1));
  stats.trimmedLength=Number(stats.trimmedLength.toFixed(1));
  return {guides:accepted,dropped,stats};}
 /* Canonicalise a row's node order: the polyline is a SET of points, so the walk's own
    start end must not leak into the result. Without this, reversing the input contour point
    order flips each walked row, which shifts the phase alignment and produces a different
    arrangement from identical terrain. */
 function canonicalNodes(nodes){
  if(nodes.length<2)return nodes;
  const a=nodes[0],b=nodes[nodes.length-1];
  const swap=(a.x>b.x+1e-9)||(Math.abs(a.x-b.x)<=1e-9&&a.y>b.y+1e-9);
  if(!swap)return nodes;
  const out=nodes.slice().reverse();
  let acc=0;
  out[0].s=0;
  for(let i=1;i<out.length;i++){acc+=Math.hypot(out[i].x-out[i-1].x,out[i].y-out[i-1].y);out[i].s=acc;}
  for(let i=0;i<out.length;i++){
   const A=out[Math.max(0,i-2)],B=out[Math.min(out.length-1,i+2)];
   const dx=B.x-A.x,dy=B.y-A.y,m=Math.hypot(dx,dy)||1;
   out[i].tx=dx/m;out[i].ty=dy/m;}
  return out;}
 /* Order-invariant sort key for a spine: its length plus the lexicographically smallest end. */
 function spineKey(st){
  const a=st[0],b=st[st.length-1];
  const minx=Math.min(a.x,b.x),maxx=Math.max(a.x,b.x);
  const miny=minx===a.x?a.y:b.y;
  return [minx,miny,maxx];}
 /* ---------------- placement ---------------- */
 function makeIndex(cell){
  const map=new Map(),keyOf=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
  return {cell,map,
   add(u){
    const k=keyOf(u.center[0],u.center[1]);
    if(!map.has(k))map.set(k,[]);
    const l=map.get(k);
    if(l.indexOf(u)<0)l.push(u);},
   remove(u){
    const l=map.get(keyOf(u.center[0],u.center[1]));
    if(!l)return;
    const i=l.indexOf(u);
    if(i>=0)l.splice(i,1);},
   near(x,y,radius){
    const out=[],r=Math.ceil(radius/cell),ci=Math.floor(x/cell),cj=Math.floor(y/cell);
    for(let i=ci-r;i<=ci+r;i++)for(let j=cj-r;j<=cj+r;j++){
     const l=map.get(i+','+j);if(!l)continue;
     for(const u of l)if(Math.hypot(u.center[0]-x,u.center[1]-y)<=radius)out.push(u);}
    return out;}};}
 function withinTol(view,normal,tolDeg){
  const dot=Math.abs(view[0]*normal[0]+view[1]*normal[1]);
  return Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI<=tolDeg+1e-9;}
 /* Full geometric test of one candidate against the boundary and everything already placed.
    Returns null when acceptable, otherwise the violated requirement. */
 function checkCandidate(center,view,ctx){
  const par=ctx.par,poly=rect(center,view,par.width,par.depth);
  if(!polyInsideBoundary(poly,ctx.boundary))return {reason:'boundary',poly};
  const me={center:center.slice(),view:view.slice(),points:poly,width:par.width,depth:par.depth};
  const near=ctx.index.near(center[0],center[1],par.acrossPitch+par.depth+par.width);
  for(const o of near){
   if(polysOverlap(poly,o.points))return {reason:'overlap',other:o};
   if(!sideClearance(me,o,par.sideGap,par.eps).ok)return {reason:'side',other:o};
   if(stripIntrusion(rearStrip(o,par.backClear),poly))return {reason:'rear',other:o};
   if(stripIntrusion(rearStrip(me,par.backClear),o.points))return {reason:'rear',other:o};}
  return null;}
 /* One placement on a guide at arc position s, with bounded row-preserving repairs in order of
    increasing cost: slide along the row, shift slightly across it, re-aim within the
    perpendicular tolerance, and finally redistribute the tail of the row. The heading's AXIS
    stays within perpTol of the local contour normal; its SENSE is decided by the front-vs-back
    ground drop (the physical rule), and the whole villa is turned, never just its arrow.
    Degenerate terrain (no normal at all) falls back to the row's own heading — documented,
    row-consistent recovery — and the unit records which it used. */
 function attemptPlacement(g,s,ctx,rowUnits){
  const par=ctx.par,q0=guidePointAt(g,s);
  if(!q0)return {ok:false,reason:'unexplored'};
  const face=ctx.field.facing(q0.x,q0.y);
  const tail=rowUnits.length?rowUnits[rowUnits.length-1].view:null;
  const axis=face?face.downhill:(tail?tail.slice():null);
  if(!axis)return {ok:false,reason:'direction'};
  const tol=par.perpTol*Math.PI/180;
  const turns=[0,tol/3,-tol/3,2*tol/3,-2*tol/3,tol,-tol];
  const slides=[0,0.75,-0.75,1.5,-1.5,2.5,-2.5,par.alongPitch/3,-par.alongPitch/3];
  const across=[0,0.75,-0.75,1.5,-1.5];
  /* candidates in order of increasing intervention: the undisturbed position first, then
     small slides, shifts and re-aims — so an ordinary villa is placed with no adjustment at
     all and the budget is spent only where it is needed */
  const cands=[];
  for(const turn of turns)for(const ds of slides)for(const da of across)
   cands.push({turn,ds,da,cost:turn*turn*4000+Math.abs(ds)+Math.abs(da)*1.5});
  cands.sort((a,b)=>a.cost-b.cost);
  const tally={};
  const note=r=>{tally[r]=(tally[r]||0)+1;};
  for(const cand of cands.slice(0,64)){
   const turn=cand.turn,ds=cand.ds,da=cand.da;
   const q=guidePointAt(g,s+ds);
   if(!q)continue;
   const t=Math.hypot(q.tx,q.ty)||1,side=[q.ty/t,-q.tx/t];
   const view=rotate(axis,turn);
   if(face&&!withinTol(view,face.downhill,par.perpTol))continue;
   const center=[q.x+side[0]*da,q.y+side[1]*da];
   let drop=groundDrop(ctx.dropField,center,view,par.depth,par.width),useView=view;
   if(!drop.ok){
    const flipped=[-view[0],-view[1]];
    const d2=groundDrop(ctx.dropField,center,flipped,par.depth,par.width);
    /* 180° flip is allowed only when the field has no facing (ambiguous). With a downhill
       axis in hand, a positive drop the other way is the IDW halo past the last contour,
       not a real reverse slope — taking it produced uphill villas on a simple test slope. */
    const flipOk=d2.ok&&(!face||(flipped[0]*face.downhill[0]+flipped[1]*face.downhill[1]>=0));
    if(flipOk){useView=flipped;drop=d2;}
    else if(tail&&(!face||withinTol(tail,face.downhill,par.perpTol))){
     // row-consistent recovery: follow this row's own heading, still inside the tolerance
     const d3=groundDrop(ctx.dropField,center,tail,par.depth,par.width);
     if(d3.ok){useView=tail.slice();drop=d3;}
     else{note('direction');continue;}}
    else{note('direction');continue;}}
   const bad=checkCandidate(center,useView,ctx);
   if(bad){note(bad.reason);continue;}
   /* the deviation is judged where the villa actually lands, not at the station: the offset
      that repairs a conflict moves the centre, and the local normal moves with it. Reporting
      and placement therefore share one reference. */
   if(face){
    const at=ctx.field.normalAt(center[0],center[1]);
    if(at&&!withinTol(useView,at,par.perpTol)){note('direction');continue;}
    if(useView[0]*face.downhill[0]+useView[1]*face.downhill[1]<0){note('direction');continue;}}
   return {ok:true,center,view:useView,drop,turn,turnDeg:Number((turn*180/Math.PI).toFixed(2)),ds,da,axis:face?'normal':'row'};}
  const grouped=redistribute(g,s,ctx,rowUnits,axis);
  if(grouped)return grouped;
  return {ok:false,reason:dominantReason(tally),tally};}
 const REASON_ORDER=['boundary','overlap','side','rear','direction','unexplored','geometry'];
 function dominantReason(tally){
  let best=null,bestN=0;
  for(const r of REASON_ORDER)if((tally[r]||0)>bestN){best=r;bestN=tally[r];}
  return best||'geometry';}
 /* Row-preserving group repair: shift the last one or two villas of the row along the row
    (their order and rhythm kept) to open space, then place the candidate in the gap. Each
    moved villa is re-checked against everything else AND against the other moved villas —
    re-adding them one at a time, so a shift can never buy a conflict — and the whole thing is
    rolled back if it does not work. */
 function redistribute(g,s,ctx,rowUnits,axis){
  const par=ctx.par,lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
  if(!rowUnits.length)return null;
  const tail=rowUnits.slice(-Math.min(2,rowUnits.length));
  for(const push of [1.5,2.5,-1.5,-2.5]){
   const plan=[];
   let ok=true;
   for(const u of tail){
    const at=arcOf(g,u)+push;
    if(at<lo||at>hi){ok=false;break;}
    const q=guidePointAt(g,at);
    if(!q){ok=false;break;}
    if(!groundDrop(ctx.dropField,[q.x,q.y],u.view,par.depth,par.width).ok){ok=false;break;}
    plan.push({u,center:[q.x,q.y]});}
   if(ok){
    const saved=tail.map(u=>({u,c:u.center.slice(),p:u.points}));
    for(const u of tail)ctx.index.remove(u);
    let clean=true;
    for(const step of plan){
     step.u.center=step.center;
     step.u.points=rect(step.u.center,step.u.view,par.width,par.depth);
     if(checkCandidate(step.u.center,step.u.view,ctx)){clean=false;break;}
     ctx.index.add(step.u);}
    if(clean){
     const q=guidePointAt(g,s+push*0.4);
     if(q){
      let view=axis.slice();
      let d=groundDrop(ctx.dropField,[q.x,q.y],view,par.depth,par.width);
      if(!d.ok){
       view=[-view[0],-view[1]];
       d=groundDrop(ctx.dropField,[q.x,q.y],view,par.depth,par.width);}
      if(d.ok&&!checkCandidate([q.x,q.y],view,ctx)){
       for(const u of tail)ctx.index.add(u);
       return {ok:true,center:[q.x,q.y],view,drop:d,repaired:'redistribute',axis:'row'};}}}
    for(const rec of saved){rec.u.center=rec.c;rec.u.points=rec.p;}
    for(const u of tail)ctx.index.add(u);}}
  return null;}
 /* Walk one row, one attempt per along-row pitch, in the traversal direction, starting from a
    phase that keeps the rows aligned with each other. A local miss (boundary pinch, neighbour)
    is skipped — the rest of the row is still walked. Abandoning after three misses was leaving
    whole lobes empty; gap recovery still fills leftover holes. */
 function placeRow(g,ctx,phase,dir){
  const par=ctx.par,pitch=par.alongPitch,lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
  if(hi-lo<pitch*0.8)return [];
  const start=alignStart(g,phase,g.famAxis,par,dir);
  const rowUnits=[];
  const placeAt=(s)=>{
   ctx.attempts++;
   const res=attemptPlacement(g,s,ctx,rowUnits);
   if(!res.ok){
    ctx.rejects.byReason[res.reason]=(ctx.rejects.byReason[res.reason]||0)+1;
    if(ctx.rejects.details.length<60)ctx.rejects.details.push({row:g.id,at:Number(s.toFixed(1)),reason:res.reason});
    return false;}
   const id='V'+String(ctx.units.length+1).padStart(3,'0');
   const u={id,name:id,center:res.center,view:res.view,
    points:rect(res.center,res.view,par.width,par.depth),
    row:g.id,family:g.family,order:rowUnits.length,reference:null,active:true,
    heading:Number((Math.atan2(res.view[1],res.view[0])*180/Math.PI).toFixed(3)),
    drop:res.drop&&res.drop.drop!==null?Number(res.drop.drop.toFixed(3)):null,
    repaired:res.repaired||null,axis:res.axis||'normal'};
   ctx.units.push(u);ctx.index.add(u);rowUnits.push(u);
   return true;};
  for(let k=0;k<300;k++){
   const s=start+dir*k*pitch;
   if(s<lo-1e-9||s>hi+1e-9)break;
   placeAt(s);
   if(ctx.units.length>=ctx.maxUnits)break;}
  /* A short or phase-unlucky guide used to publish 0 villas while still drawing on the map
     (R04/R06). One midpoint attempt is still row-based, not a scatter fill. */
  if(!rowUnits.length&&hi-lo>=par.width)placeAt((lo+hi)/2);
  return rowUnits;}
 /* Shared alignment: each row's phase is measured against the family's own axis, not against
    the row's arc origin, so neighbouring rows keep a recognisable shared alignment instead of
    drifting into a systematic half-pitch stagger. */
 function alignStart(g,phase,famAxis,par,dir){
  const n=g.nodes;
  if(!n.length)return 0;
  const pitch=par.alongPitch,u=famAxis||[n[0].tx,n[0].ty];
  const lo=n[0].s,hi=n[n.length-1].s,target=((phase%pitch)+pitch)%pitch;
  let first=null,last=null;
  for(let s=lo;s<=hi;s+=1){
   const q=guidePointAt(g,s);
   const proj=q.x*u[0]+q.y*u[1],frac=((proj%pitch)+pitch)%pitch;
   const hit=Math.abs(frac-target)<0.5||Math.abs(frac-target)>pitch-0.5;
   if(hit){if(first===null)first=s;last=s;}}
  if(first===null)return dir>0?lo:hi;
  return dir>0?first:last;}
 /* ---------------- generation + bounded search ---------------- */
 /* One complete alternative: every row walked with the same along-row phase and the same
    traversal direction. Alternatives are compared whole — never concatenated. */
 function runVariant(guides,boundary,field,dropField,par,phase,dir,maxUnits){
  const ctx={units:[],index:makeIndex(Math.max(par.alongPitch,par.acrossPitch)),
   rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField,maxUnits};
  for(const g of guides)placeRow(g,ctx,phase,dir);
  return {units:ctx.units,rejects:ctx.rejects,attempts:ctx.attempts,phase,dir};}
 /* Row bookkeeping for the output data: membership and ordering, plus the guide geometry so
    the viewer can overlay it. */
 function rowsOf(units,guides,par){
  const groups=new Map();
  for(const u of units){
   if(!groups.has(u.row))groups.set(u.row,[]);
   groups.get(u.row).push(u);}
  return guides.map(g=>({
   id:g.id,family:g.family,level:g.level,offset:g.offset,
   length:Number((g.nodes[g.nodes.length-1].s-g.nodes[0].s).toFixed(2)),
   nodes:g.nodes.map(n=>({x:Number(n.x.toFixed(3)),y:Number(n.y.toFixed(3)),s:Number(n.s.toFixed(3))})),
   units:(groups.get(g.id)||[]).slice().sort((a,b)=>a.order-b.order).map(u=>u.id)}));}
 /* Generate a full arrangement. Bounded, deterministic search over complete alternatives
    (along-row phase x traversal direction), then a row-based gap-recovery pass on the winner.
    Identical inputs and settings always produce identical output: no randomness, no clock. */
 function generateLayout(data,opts){
  const t0=Date.now();
  const st=settings(opts);
  if(!st.ok)return {ok:false,error:st.errors.join('; '),errors:st.errors,units:[],rows:[]};
  const par=st.values;
  par.maxUnits=(opts&&Number.isFinite(Number(opts.maxUnits)))?Math.max(1,Number(opts.maxUnits)):300;
  const boundary=(data&&data.boundary)||[];
  if(boundary.length<3)return {ok:false,error:'no site boundary available',units:[],rows:[]};
  const smoothed=(opts&&opts.smoothed)||(data&&data.contours)||[];
  if(!smoothed.length)return {ok:false,error:'no contour lines to generate from',units:[],rows:[]};
  const terrain=(opts&&opts.terrainLines)||smoothed;
  const field=buildField(smoothed,par);
  const dropField=buildField(terrain,par);
  const built=buildGuides(field,boundary,par,smoothed);
  if(!built.guides.length)return {ok:false,error:'no row guides could be derived from this terrain',units:[],rows:[]};
  const variants=[];
  for(const phase of [0,par.alongPitch/3,2*par.alongPitch/3])for(const dir of [1,-1]){
   const v=runVariant(built.guides,boundary,field,dropField,par,phase,dir,par.maxUnits);
   const rows=rowsOf(v.units,built.guides,par);
   const validation=validate({units:v.units,rows},boundary,par);
   const met=metrics({units:v.units,rows},boundary,field,par,{rejects:v.rejects,attempts:v.attempts,validation});
   variants.push({units:v.units,rows,rejects:v.rejects,attempts:v.attempts,validation,metrics:met,phase,dir});}
  const viable=variants.filter(v=>v.validation.ok);
  const pool=viable.length?viable:variants.slice();
  /* priority: hard requirements pass (viable first) -> more villas -> less unnecessary
     spacing -> less heading jitter -> deterministic tie-break. No weighted score, so extra
     villas can never buy a broken constraint. */
  pool.sort((a,b)=>b.units.length-a.units.length||
   a.metrics.spacing.extraSpacing-b.metrics.spacing.extraSpacing||
   a.metrics.heading.jitter-b.metrics.heading.jitter||
   a.phase-b.phase||a.dir-b.dir);
  const winner=pool[0];
  const units=winner.units;
  const recovery=recover({units},boundary,field,dropField,par,built.guides);
  /* Safety net. Placement and repair already enforce every requirement, but the delivered
     layout is judged by the INDEPENDENT validator, so anything it still rejects is removed
     here — and reported, never silently accepted. */
  const holder={units};
  const pruned=prune(holder,boundary,par);
  const rows=rowsOf(holder.units,built.guides,par);
  const layout={units:holder.units,rows,params:par};
  const validation=validate(layout,boundary,par);
  const met=metrics(layout,boundary,field,par,{rejects:winner.rejects,attempts:winner.attempts,validation,gaps:recovery.failed});
  /* `ok` means "a valid arrangement was produced": an empty layout passes validation
     vacuously, and reporting that as success would let a terrain where nothing can be placed
     look like a good result. */
  const okFinal=validation.ok&&layout.units.length>0;
  return {ok:okFinal,
   error:okFinal?null:(layout.units.length?'generated layout failed independent validation'
    :'no villa could be placed on this terrain (rejections: '+JSON.stringify(met.rejects.byReason)+')'),
   units:layout.units,rows,params:par,validation,metrics:met,rejects:winner.rejects,recovery,pruned,
   budget:{variants:variants.length,attempts:winner.attempts,recoveryTries:recovery.tried,
    viableVariants:viable.length,counts:variants.map(v=>({phase:Number(v.phase.toFixed(1)),dir:v.dir,units:v.units.length,ok:v.validation.ok}))},
   guides:{count:built.guides.length,dropped:built.dropped.length},
   elapsedMs:Date.now()-t0};}
 /* Remove villas the independent validator rejects (safety net, reported by the caller). */
 function prune(layout,boundary,par,maxRounds){
  const removed=[];
  for(let round=0;round<(maxRounds||6);round++){
   const res=validate(layout,boundary,par);
   if(res.ok)break;
   const bad=new Set();
   for(const iss of res.issues){
    if(iss.type==='overlap'||iss.type==='side'||iss.type==='rear'){if(iss.b)bad.add(iss.b);}
    else if(iss.id)bad.add(iss.id);}
   if(!bad.size)break;
   layout.units=layout.units.filter(u=>{
    if(bad.has(u.id)){removed.push(u.id);return false;}
    return true;});}
  return removed;}
 /* Gap recovery, row-based (never random point filling): row ends, oversized internal gaps
    where a small collective shift could make another legal villa fit, and rows the initial
    pass abandoned. Every attempt goes through the same repair path as placement. */
 function recover(layout,boundary,field,dropField,par,guides){
  const out={added:[],tried:0,failed:[]};
  const ctx={units:layout.units,index:makeIndex(Math.max(par.alongPitch,par.acrossPitch)),
   rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField,maxUnits:par.maxUnits+40};
  for(const u of layout.units)ctx.index.add(u);
  for(const g of guides){
   const list=layout.units.filter(u=>u.row===g.id).slice().sort((a,b)=>a.order-b.order);
   const lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
   const marks=[lo].concat(list.map(u=>arcOf(g,u)),[hi]).sort((a,b)=>a-b);
   for(let i=0;i+1<marks.length;i++){
    const gap=marks[i+1]-marks[i];
    if(gap<par.alongPitch*1.6)continue;
    const samples=[];
    for(let s=marks[i]+par.alongPitch;s<=marks[i+1]-par.alongPitch*0.45;s+=par.alongPitch)samples.push(s);
    if(!samples.length)samples.push(marks[i]+gap/2);
    for(const s of samples){
     if(s<lo||s>hi)continue;
     out.tried++;
     const before=list.filter(u=>arcOf(g,u)<s);
     const res=attemptPlacement(g,s,ctx,before);
     if(res.ok){
      const id='V'+String(ctx.units.length+1).padStart(3,'0');
      const u={id,name:id,center:res.center,view:res.view,
       points:rect(res.center,res.view,par.width,par.depth),
       row:g.id,family:g.family,order:before.length,reference:null,active:true,
       heading:Number((Math.atan2(res.view[1],res.view[0])*180/Math.PI).toFixed(3)),
       drop:res.drop&&res.drop.drop!==null?Number(res.drop.drop.toFixed(3)):null,
       repaired:res.repaired||null,recovered:true,axis:res.axis||'normal'};
      const after=list.filter(x=>arcOf(g,x)>=s);
      after.forEach(x=>{x.order+=1;});
      list.length=0;
      list.push.apply(list,before.concat([u],after));
      ctx.units.push(u);ctx.index.add(u);
      out.added.push(u.id);}
     else out.failed.push({row:g.id,at:Number(s.toFixed(1)),reason:res.reason});}}}
  return out;}
 /* ---------------- metrics: what "good" means ---------------- */
 /* Spacing statistics use meaningful neighbours only (consecutive villas within a row for the
    side gaps, nearest villa across rows for the rear gaps) — never an average over every
    pair. Heading smoothness is judged against the terrain's own change of direction, so a
    coherent curved row is not penalised for being curved. */
 function metrics(layout,boundary,field,par,extra){
  const units=layout.units||[],rows=layout.rows||[],groups=new Map();
  for(const u of units){
   if(!groups.has(u.row))groups.set(u.row,[]);
   groups.get(u.row).push(u);}
  const rowLists=[...groups.values()].map(l=>l.slice().sort((a,b)=>a.order-b.order));
  const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;
  let orWorst=0,orSum=0,orN=0,orBeyond=0;
  for(const u of units){
   const n=(field&&field.normalAt)?field.normalAt(u.center[0],u.center[1]):null;
   if(!n)continue;
   const d=angle(u.view,n),dev=Math.min(d,180-d); // axis deviation, sense-free
   orWorst=Math.max(orWorst,dev);orSum+=dev;orN++;
   if(dev>par.perpTol+1e-6)orBeyond++;}
  let headWorst=0,headSum=0,headN=0,exWorst=0,exSum=0,baseSum=0,breaks=0;
  const sideGaps=[],rearGaps=[];
  for(const list of rowLists){
   for(let i=0;i+1<list.length;i++){
    const a=list[i],b=list[i+1],d=angle(a.view,b.view);
    headWorst=Math.max(headWorst,d);headSum+=d;headN++;
    let base=0;
    if(field&&field.normalAt){
     const na=field.normalAt(a.center[0],a.center[1]),nb=field.normalAt(b.center[0],b.center[1]);
     if(na&&nb)base=Math.min(angle(na,nb),angle(na,[-nb[0],-nb[1]]));}
    baseSum+=base;
    const ex=Math.max(0,d-base);
    exWorst=Math.max(exWorst,ex);exSum+=ex;
    sideGaps.push(polyDist(a.points,b.points));
    if(Math.hypot(b.center[0]-a.center[0],b.center[1]-a.center[1])>par.alongPitch*1.6)breaks++;}}
  for(const u of units){
   let best=Infinity;
   for(const v of units){
    if(v.row===u.row)continue;
    const d=Math.hypot(v.center[0]-u.center[0],v.center[1]-u.center[1]);
    if(d<best)best=d;}
   if(best<Infinity&&best<par.acrossPitch*1.8)rearGaps.push(best-par.depth/2);}
  const used=rowLists.filter(l=>l.length).length;
  const potential=rows.reduce((s,g)=>s+(g.length||0)/par.alongPitch,0);
  return {
   count:units.length,
   rows:{guides:rows.length,used,maxPerRow:Math.max(0,...rowLists.map(l=>l.length)),
    meanPerRow:used?Number((units.length/used).toFixed(2)):0},
   violations:extra&&extra.validation?extra.validation.issues.length:null,
   issues:(extra&&extra.validation?extra.validation.issues:[]).slice(0,25),
   orientation:{worst:Number(orWorst.toFixed(2)),mean:orN?Number((orSum/orN).toFixed(2)):0,
    beyondTolerance:orBeyond,tolerance:par.perpTol},
   heading:{worst:Number(headWorst.toFixed(2)),mean:headN?Number((headSum/headN).toFixed(2)):0,
    excessWorst:Number(exWorst.toFixed(2)),excessMean:headN?Number((exSum/headN).toFixed(2)):0,
    terrainTurnMean:headN?Number((baseSum/headN).toFixed(2)):0},
   spacing:{side:summ(sideGaps),rear:summ(rearGaps),
    alongPitch:Number(par.alongPitch.toFixed(2)),acrossPitch:Number(par.acrossPitch.toFixed(2)),
    potentialVillas:Number(potential.toFixed(1)),
    extraSpacing:Number(Math.max(0,(potential-units.length)*par.alongPitch).toFixed(1))},
   breaks,unexplainedGaps:extra&&extra.gaps?extra.gaps.length:0,
   rejects:(extra&&extra.rejects)||{byReason:{},details:[]},
   placementAttempts:(extra&&extra.attempts)||0};}
 function summ(a){
  if(!a.length)return {min:null,mean:null,max:null,n:0};
  const s=a.slice().sort((x,y)=>x-y),sum=a.reduce((p,c)=>p+c,0);
  return {min:Number(s[0].toFixed(2)),mean:Number((sum/a.length).toFixed(2)),
   max:Number(s[s.length-1].toFixed(2)),n:a.length};}

 /* ---------------- independent validation ---------------- */
 /* Rebuilds every footprint, rear strip and relationship from the OUTPUT data (centre, view,
    width, depth) rather than trusting stored corners, and restates the clearance predicate
    independently of the placement code so the same bug cannot approve itself twice. */
 function validate(layout,boundary,parIn){
  const st=settings(parIn||{});
  const par=st.ok?st.values:Object.assign({},DEFAULTS,parIn||{});
  const units=(layout&&layout.units)||[],issues=[];
  const polies=units.map(u=>rect(u.center,u.view,par.width,par.depth));
  units.forEach((u,i)=>{
   if(u.points&&u.points.length===4){
    for(let k=0;k<4;k++){
     if(Math.hypot(u.points[k][0]-polies[i][k][0],u.points[k][1]-polies[i][k][1])>1e-6){
      issues.push({type:'stale-geometry',id:u.id});
      break;}}}
   const m=Math.hypot(u.view[0],u.view[1]);
   if(Math.abs(m-1)>1e-6)issues.push({type:'view-not-unit',id:u.id});
   if(boundary&&boundary.length>=3&&!polyInsideBoundary(polies[i],boundary))issues.push({type:'boundary',id:u.id});});
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
   const a=units[i],b=units[j];
   if(polysOverlap(polies[i],polies[j])){issues.push({type:'overlap',a:a.id,b:b.id});continue;}
   const gap=polyDist(polies[i],polies[j]);
   if(gap<=par.sideGap+par.eps){
    let ok=false;
    for(const k of [i,j]){
     const v=units[k].view,side=[v[1],-v[0]],c=units[k].center;
     const proj=p=>(p[0]-c[0])*side[0]+(p[1]-c[1])*side[1];
     const pa=polies[i].map(proj),pb=polies[j].map(proj);
     const sep=Math.max(Math.min.apply(null,pa)-Math.max.apply(null,pb),
                        Math.min.apply(null,pb)-Math.max.apply(null,pa));
     if(sep>par.sideGap+par.eps)ok=true;}
    if(!ok)issues.push({type:'side',a:a.id,b:b.id,gap:Number(gap.toFixed(3))});}
   const sa=rearStrip({center:a.center,view:a.view,width:par.width,depth:par.depth},par.backClear);
   const sb=rearStrip({center:b.center,view:b.view,width:par.width,depth:par.depth},par.backClear);
   if(stripIntrusion(sa,polies[j]))issues.push({type:'rear',a:a.id,b:b.id,which:'A'});
   else if(stripIntrusion(sb,polies[i]))issues.push({type:'rear',a:b.id,b:a.id,which:'B'});}
  if(layout&&layout.rows){
   const ids=new Set(layout.rows.map(r=>r.id)),seen=new Set();
   for(const u of units){
    if(!u.row)issues.push({type:'row-missing',id:u.id});
    else{
     if(!ids.has(u.row))issues.push({type:'row-unknown',id:u.id,row:u.row});
     const g=layout.rows.find(r=>r.id===u.row);
     if(g&&g.units&&g.units.indexOf(u.id)<0)issues.push({type:'row-membership',id:u.id,row:u.row});}
    const key=u.row+'#'+u.order;
    if(seen.has(key))issues.push({type:'row-order-duplicate',row:u.row,order:u.order});
    seen.add(key);}}
  return {ok:!issues.length,issues,count:units.length,params:par};}
 /* kept API: verify(units,boundary,sideGap,backClear) */
 function verify(units,boundary,sideGap,backClear){
  const res=validate({units},boundary,{sideGap,backClear});
  return {issues:res.issues,ok:res.ok,count:units.length};}
 /* kept API: generate(data,opts) -> units */
 function generate(data,opts){
  const res=generateLayout(data,opts);
  return res.units||[];}
 /* kept API: downhill-ward unit vector at a point, or null when the terrain says nothing */
 function downhillAt(x,y,lines){
  const f=buildField(lines||[],DEFAULTS);
  const face=f.facing(x,y);
  return face?face.downhill:null;}

 /* ---------------- terrain smoothing ---------------- */
 function resample(points,step){
  if(points.length<3||step<=0)return points.map(p=>p.slice());
  const out=[points[0].slice()];
  let acc=0;
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
   acc+=d;
   if(acc>=step){out.push(b.slice());acc=0;}}
  if(out.length<2||out[out.length-1][0]!==points[points.length-1][0]||out[out.length-1][1]!==points[points.length-1][1])out.push(points[points.length-1].slice());
  return out;}
 function chaikin(points,rounds){
  let p=points.map(q=>q.slice());
  for(let r=0;r<rounds;r++){
   if(p.length<3)break;
   const out=[p[0].slice()];
   for(let i=0;i+1<p.length;i++){
    const a=p[i],b=p[i+1];
    out.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25]);
    out.push([a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75]);}
   out.push(p[p.length-1].slice());
   p=out;}
  return p;}
 /* Guidance-only smoothing, always recomputed from the source handed in. The caller passes
    the ACCEPTED terrain contours — never a previously smoothed result, and never the shipped
    contours while the user is looking at an edited terrain.
    Level 0 is a deep copy. Levels 1–60 thin each polyline to step = 2 + 2·level metres
    (4 m … 122 m). Levels 1–6 stay on one Chaikin pass (same as before); then 2, 3, and at
    most 4 rounds so the top of the slider rounds more instead of only dropping vertices.
    Same contour count, same labels, endpoints kept; reference elevations are never touched. */
 const SMOOTH_MAX=60;
 function smoothContours(contours,level){
  const lvl=Math.max(0,Math.min(SMOOTH_MAX,Math.round(level||0)));
  if(!lvl)return contours.map(c=>({...c,points:c.points.map(p=>p.slice())}));
  const step=2+lvl*2;
  const rounds=Math.min(4,1+Math.floor((lvl-1)/7));
  return contours.map(c=>({...c,points:chaikin(resample(c.points,step),rounds)}));}

 return {VILLA,DEFAULTS,settings,
  rect,rectangle,rotatePoints,rotate,pointInPoly,segDist,ptPolyDist,polyDist,polysOverlap,polyInsideBoundary,segCross,
  buildField,groundDrop,rearStrip,stripIntrusion,rearConflict,sideClearance,sideGapOK,
  stations,curvature,smoothPath,spineNormals,offsetStations,selfCuts,guidePointAt,arcOf,splitByTurn,buildGuides,
  makeIndex,checkCandidate,attemptPlacement,redistribute,placeRow,alignStart,withinTol,
  generate,generateLayout,rowsOf,runVariant,recover,prune,metrics,validate,verify,downhillAt,
  SMOOTH_MAX,smoothContours,resample,chaikin};
})();
if(typeof module!=='undefined')module.exports=ParallelPara;
