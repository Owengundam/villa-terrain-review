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
 * Pipeline: settings() -> buildField() -> buildGuideFamilies() -> placeRow() -> generateLayout()
 * (across-row phase × along-row phase × direction, then row-based gap recovery, then a
 * geometry-only densify pass kept only on a validated net gain) -> metrics() -> validate().
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
 /* Built from contour polylines only.
    Between two distinct levels, zAt interpolates linearly along the line joining the closest
    points on those contours — monotone, no dip. Beyond the outer contour it EXTRAPOLATES
    that same plane (unsigned inverse-distance blending falls toward the nearer line and
    inverts the slope). A single nearby level, or no levels in range, is not a heading:
    zInfo reports 'level' / 'unverified' and facing() returns null so callers can skip the
    station as terrain-unverified rather than invent a downhill. */
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
  function closestOnSeg(s,x,y){
   const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],l2=dx*dx+dy*dy||1;
   const t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(y-s.a[1])*dy)/l2));
   const px=s.a[0]+t*dx,py=s.a[1]+t*dy;
   return {px,py,d:Math.hypot(x-px,y-py)};}
  function segmentDist(s,x,y){return closestOnSeg(s,x,y).d;}
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
      const s=segs[idx],hit=closestOnSeg(s,x,y),key=s.z.toFixed(3);
      if(!best.has(key)||best.get(key).d>hit.d)best.set(key,{z:s.z,d:hit.d,px:hit.px,py:hit.py});}}
    if(best.size>=2){
     const arr=[...best.values()].sort((a,b)=>a.d-b.d);
     const z1=arr[0].z;
     let second=null;
     for(const v of arr)if(Math.abs(v.z-z1)>0.01){second=v;break;}
     if(second&&r*cell>=second.d)break;}}
   return [...best.values()].sort((a,b)=>a.d-b.d);}
  function zInfo(x,y){
   const lv=nearestLevels(x,y,80);
   if(!lv.length)return {z:null,status:'unverified'};
   const a=lv[0];
   let b=null;
   for(let i=1;i<lv.length;i++)if(Math.abs(lv[i].z-a.z)>0.01){b=lv[i];break;}
   if(!b){
    const far=nearestLevels(x,y,240);
    for(let i=0;i<far.length;i++)if(Math.abs(far[i].z-a.z)>0.01){b=far[i];break;}
    if(!b)return {z:a.z,status:'level'};}
   if(a.d<1e-9)return {z:a.z,status:'interpolated'};
   const vx=a.px-b.px,vy=a.py-b.py,span2=vx*vx+vy*vy;
   if(span2<1e-6)return {z:a.z,status:'level'};
   /* Two closest-points do not uniquely determine a 3D plane. The missing assumption is
      that slope lies along the horizontal joining segment of those two points, with zero
      slope in the perpendicular horizontal direction (a ruled interpolation, not a
      three-point plane). Parameter t is 0 at the farther closest-point b and 1 at the
      nearer a: z = z_b + (z_a − z_b) t, with
        t = ((x,y) − b) · (a − b) / |a − b|²
      The same formula interpolates between the contours and extrapolates beyond them. */
   const t=((x-b.px)*vx+(y-b.py)*vy)/span2;
   const z=b.z+(a.z-b.z)*t;
   const between=t>=-1e-6&&t<=1+1e-6;
   return {z,status:between?'interpolated':'extrapolated',t,pair:[a,b]};}
  function zAt(x,y){const i=zInfo(x,y);return i.z;}
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
   const info=zInfo(x,y);
   if(!info||info.status==='unverified'||info.status==='level')return null;
   const n=normalAt(x,y);
   return n?{uphill:n,downhill:[-n[0],-n[1]],terrain:info.status}:null;}
  return {segs,grid,segmentDist,nearSegments,nearestLevels,zAt,zInfo,tangentAt,normalAt,facing};}
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
 function inUsable(usable,s){
  if(!usable||!usable.length)return true;
  for(const iv of usable)if(s>=iv.lo-1e-9&&s<=iv.hi+1e-9)return true;
  return false;}
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
 /* Row guides from contour spines. A contour is reference GEOMETRY for the shape and
    direction of a family, not an immovable building row. Families are
      G_k(s) = C(s) + (δ + k P) n(s)
    with P the parameter-derived across-row pitch and δ an across-row phase. Complete
    (spine, δ) arrangements are compared; rows are not greedily hashed into one growing
    exclusion index. Only stations where an oriented footprint fits, and downhill is
    verified, become usable intervals — unusable stretches do not reserve spacing.
    No extra positional smoothing: the caller's smoothed polylines are already the
    guidance, and a second 24 m window would change the meaning of Terrain response scale. */
 function retangent(list){
  if(!list.length)return list;
  let acc=0;list[0].s=0;
  for(let i=1;i<list.length;i++){
   acc+=Math.hypot(list[i].x-list[i-1].x,list[i].y-list[i-1].y);list[i].s=acc;}
  for(let i=0;i<list.length;i++){
   const a=list[Math.max(0,i-2)],b=list[Math.min(list.length-1,i+2)];
   const dx=b.x-a.x,dy=b.y-a.y,m=Math.hypot(dx,dy)||1;
   list[i].tx=dx/m;list[i].ty=dy/m;list[i].nx=-dy/m;list[i].ny=dx/m;}
  return list;}
 function usableIntervals(nodes,field,boundary,par){
  const out=[],g={nodes},lo=nodes[0].s,hi=nodes[nodes.length-1].s;
  let run=null,unverified=0;
  const step=par.stationStep;
  for(let s=lo;s<=hi+1e-9;s+=step){
   const q=guidePointAt(g,s);
   if(!q){if(run){out.push(run);run=null;}continue;}
   const info=field.zInfo?field.zInfo(q.x,q.y):null;
   const face=field.facing(q.x,q.y);
   let ok=false;
   if(!face||(info&&(info.status==='unverified'||info.status==='level'))){
    unverified++;}
   else{
    const poly=rect([q.x,q.y],face.downhill,par.width,par.depth);
    if(polyInsideBoundary(poly,boundary)&&groundDrop(field,[q.x,q.y],face.downhill,par.depth,par.width).ok)
     ok=true;}
   if(ok){if(!run)run={lo:s,hi:s};else run.hi=s;}
   else if(run){out.push(run);run=null;}}
  if(run)out.push(run);
  return {intervals:out,unverified};}
 function punchCloseRows(rows,minSep,step){
  const samples=[];
  for(let i=0;i<rows.length;i++){
   const g={nodes:rows[i].nodes};
   for(const iv of rows[i].usable){
    for(let s=iv.lo;s<=iv.hi+1e-9;s+=step)
     {const q=guidePointAt(g,s);if(q)samples.push({i,s,x:q.x,y:q.y});}}}
  const cell=Math.max(minSep,1),hash=new Map();
  const key=(x,y)=>Math.floor(x/cell)+','+Math.floor(y/cell);
  const add=(p)=>{const k=key(p.x,p.y);if(!hash.has(k))hash.set(k,[]);hash.get(k).push(p);};
  const near=(x,y,exceptI)=>{
   const ci=Math.floor(x/cell),cj=Math.floor(y/cell);let best=Infinity;
   for(let i=ci-2;i<=ci+2;i++)for(let j=cj-2;j<=cj+2;j++){
    const l=hash.get(i+','+j);if(!l)continue;
    for(const p of l){if(p.i===exceptI)continue;const d=Math.hypot(p.x-x,p.y-y);if(d<best)best=d;}}
   return best;};
  rows.sort((a,b)=>Math.abs(a.offset)-Math.abs(b.offset)||a.offset-b.offset);
  for(let i=0;i<rows.length;i++){
   const g={nodes:rows[i].nodes},kept=[];
   for(const iv of rows[i].usable){
    let run=null;
    for(let s=iv.lo;s<=iv.hi+1e-9;s+=step){
     const q=guidePointAt(g,s);if(!q)continue;
     if(near(q.x,q.y,i)<minSep){if(run){kept.push(run);run=null;}continue;}
     if(!run)run={lo:s,hi:s};else run.hi=s;}
    if(run)kept.push(run);}
   rows[i].usable=kept;
   for(const iv of kept)for(let s=iv.lo;s<=iv.hi+1e-9;s+=step){
    const q=guidePointAt(g,s);if(q)add({i,s,x:q.x,y:q.y});}}
  return rows.filter(r=>r.usable.length);}
 function familyFromSpine(spine,delta,field,boundary,par){
  const P=par.acrossPitch,minSep=par.depth+par.backClear-0.2,step=par.stationStep;
  const rows=[],maxK=14;
  for(let k=-maxK;k<=maxK;k++){
   const dist=delta+k*P;
   const pieces=offsetStations(spine.nodes,dist,{boundary,maxFold:par.maxFold});
   for(const pc of pieces){
    if(pc.length<3)continue;
    const nodes=canonicalNodes(retangent(pc.map(p=>({x:p.x,y:p.y,s:p.s,tx:p.tx,ty:p.ty}))));
    if(nodes.length<3)continue;
    const mid=nodes[Math.floor(nodes.length/2)];
    const fn=field.normalAt(mid.x,mid.y);
    if(fn){
     const rn=[-mid.ty,mid.tx];
     const dot=Math.abs(fn[0]*rn[0]+fn[1]*rn[1]);
     const ang=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
     if(ang>40)continue;}
    const mask=usableIntervals(nodes,field,boundary,par);
    if(!mask.intervals.length)continue;
    const raw=mask.intervals.map(iv=>({lo:iv.lo,hi:iv.hi}));
    rows.push({nodes,usable:mask.intervals,usableRaw:raw,offset:dist,k,level:field.zAt(mid.x,mid.y),
     unverified:mask.unverified,length:nodes[nodes.length-1].s-nodes[0].s});}}
  return punchCloseRows(rows,minSep,step);}
 function pickSpines(lines,field,par,boundary){
  const spines=[];
  for(const l of lines||[]){
   const pts=l.points||l.controls||[];
   if(pts.length<2)continue;
   const st=spineNormals(stations(pts,par.stationStep),field);
   if(st.length<3)continue;
   curvature(st,4);
   const len=st[st.length-1].s;
   if(len<par.alongPitch)continue;
   if(boundary&&boundary.length>=3&&!st.some(p=>pointInPoly([p.x,p.y],boundary)))continue;
   spines.push({z:l.z,nodes:st,length:len});}
  spines.sort((a,b)=>b.length-a.length||a.z-b.z);
  const picked=[];
  for(const s of spines){
   if(picked.length>=2)break;
   if(!picked.length){picked.push(s);continue;}
   const mid=s.nodes[Math.floor(s.nodes.length/2)];
   const far=picked.every(p=>{
    const q=p.nodes[Math.floor(p.nodes.length/2)];
    return Math.hypot(mid.x-q.x,mid.y-q.y)>80;});
   if(far)picked.push(s);}
  return picked;}
 function rowsToGuides(rows,delta,spineId){
  const guides=rows.map((r,i)=>{
   let sx=0,sy=0;
   for(const n of r.nodes){sx+=n.tx;sy+=n.ty;}
   const m=Math.hypot(sx,sy);
   return {id:'R'+String(i+1).padStart(2,'0'),family:r.k,level:r.level,offset:r.offset,
    nodes:r.nodes,usable:r.usable,usableRaw:r.usableRaw||r.usable,length:r.length,delta,spineId,
    famAxis:m>1e-9?[sx/m,sy/m]:null,unverified:r.unverified||0};});
  return guides;}
 function mergeFamilyRows(a,b,minSep,step){
  const rows=a.concat(b).map(r=>({nodes:r.nodes,usable:r.usable.slice(),
   usableRaw:(r.usableRaw||r.usable).map(iv=>({lo:iv.lo,hi:iv.hi})),
   offset:r.offset,k:r.k,level:r.level,unverified:r.unverified,length:r.length}));
  return punchCloseRows(rows,minSep,step);}
 function buildGuideFamilies(field,boundary,par,lines){
  const stats={candidateLength:0,acceptedLength:0,trimmedLength:0,families:0,unverified:0};
  if(!field.segs.length||boundary.length<3)return [];
  const spines=pickSpines(lines,field,par,boundary);
  if(!spines.length)return [];
  const P=par.acrossPitch,minSep=par.depth+par.backClear-0.2,step=par.stationStep;
  const deltas=[0,P/3,2*P/3];
  const families=[];
  const pushFam=(rows,delta,spineId,merged)=>{
   if(!rows.length)return;
   const guides=rowsToGuides(rows,delta,spineId);
   const usableLen=guides.reduce((s,g)=>s+g.usable.reduce((t,iv)=>t+(iv.hi-iv.lo),0),0);
   stats.families++;
   stats.acceptedLength+=guides.reduce((s,g)=>s+g.length,0);
   stats.unverified+=guides.reduce((s,g)=>s+(g.unverified||0),0);
   families.push({guides,delta,spineId,merged:!!merged,usableLength:Number(usableLen.toFixed(1)),
    stats:{acceptedLength:Number(guides.reduce((s,g)=>s+g.length,0).toFixed(1)),
     usableLength:Number(usableLen.toFixed(1)),rows:guides.length}});};
  if(spines.length===1){
   for(const d of deltas)pushFam(familyFromSpine(spines[0],d,field,boundary,par),d,0,false);}
  else{
   for(const d of deltas){
    const a=familyFromSpine(spines[0],d,field,boundary,par);
    const b=familyFromSpine(spines[1],d,field,boundary,par);
    pushFam(mergeFamilyRows(a,b,minSep,step),d,'0+1',true);}}
  stats.acceptedLength=Number(stats.acceptedLength.toFixed(1));
  return families;}
 function buildGuides(field,boundary,par,lines){
  const families=buildGuideFamilies(field,boundary,par,lines);
  if(!families.length)return {guides:[],dropped:[],stats:{acceptedLength:0,families:0},families};
  families.sort((a,b)=>b.usableLength-a.usableLength||a.delta-b.delta);
  const pick=families[0];
  return {guides:pick.guides,dropped:[],stats:Object.assign({families:families.length},pick.stats),families};}

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
  if(!axis){
   const info=ctx.field.zInfo?ctx.field.zInfo(q0.x,q0.y):null;
   const unverified=info&&(info.status==='unverified'||info.status==='level');
   return {ok:false,reason:unverified?'unverified':'direction'};}
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
 const REASON_ORDER=['boundary','overlap','side','rear','direction','unverified','unexplored','geometry'];
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
   if(g.usable&&!inUsable(g.usable,s))return false;
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
   usable:g.usable,usableRaw:g.usableRaw,emptyReason:g.emptyReason||null,
   units:(groups.get(g.id)||[]).slice().sort((a,b)=>a.order-b.order).map(u=>u.id)}));}
 /* Geometry-only densification of an already-chosen arrangement. The guide family is kept;
    this pass only changes where centres sit on those rows (and, if a pocket has no guide,
    may add one parallel sibling). A candidate is committed only when independent validation
    still passes AND the villa count strictly increases. Construction margin is unchanged. */
 function cloneUnit(u){
  return {id:u.id,name:u.name,center:u.center.slice(),view:u.view.slice(),
   points:u.points.map(p=>p.slice()),row:u.row,family:u.family,order:u.order,
   reference:u.reference,active:u.active!==false,heading:u.heading,drop:u.drop,
   repaired:u.repaired,axis:u.axis,recovered:u.recovered,densified:u.densified};}
 function cloneUnits(units){return (units||[]).map(cloneUnit);}
 function makePlaceCtx(units,boundary,field,dropField,par){
  const ctx={units:units,index:makeIndex(Math.max(par.alongPitch,par.acrossPitch)),
   rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField,
   maxUnits:(par.maxUnits||300)+80};
  for(const u of units)ctx.index.add(u);
  return ctx;}
 function intervalsOf(g,release){
  const raw=release&&g.usableRaw&&g.usableRaw.length?g.usableRaw:(g.usable||[]);
  if(raw.length)return raw;
  if(!g.nodes||!g.nodes.length)return [];
  return [{lo:g.nodes[0].s,hi:g.nodes[g.nodes.length-1].s}];}
 function intervalStarts(iv,pitch){
  const out=[],seen=new Set();
  const span=iv.hi-iv.lo;
  if(span<0)return out;
  const offs=[0];
  const third=pitch/3;
  if(third>0&&third<span)offs.push(third,2*third);
  const add=(s,dir)=>{
   const key=dir+':'+s.toFixed(3);
   if(s<iv.lo-1e-9||s>iv.hi+1e-9||seen.has(key))return;
   seen.add(key);out.push({s,dir});};
  for(const o of offs){add(iv.lo+o,1);add(iv.hi-o,-1);}
  return out;}
 function commitVilla(g,res,ctx,rowUnits){
  const id='V'+String(ctx.units.length+1).padStart(3,'0');
  const u={id,name:id,center:res.center,view:res.view,
   points:rect(res.center,res.view,ctx.par.width,ctx.par.depth),
   row:g.id,family:g.family,order:rowUnits.length,reference:null,active:true,
   heading:Number((Math.atan2(res.view[1],res.view[0])*180/Math.PI).toFixed(3)),
   drop:res.drop&&res.drop.drop!==null?Number(res.drop.drop.toFixed(3)):null,
   repaired:res.repaired||null,axis:res.axis||'normal',densified:true};
  ctx.units.push(u);ctx.index.add(u);rowUnits.push(u);
  return u;}
 function dropUnits(ctx,pred){
  const keep=[];
  for(const u of ctx.units){
   if(pred(u))ctx.index.remove(u);
   else keep.push(u);}
  ctx.units=keep;}
 /* Pack one usable centre-interval: try boundary-aware starts from both ends (and a few
    nearby refinements), walk the adopted along-row pitch, keep the start that places the
    most geometrically valid villas. A nominal pitch guides the walk; actual rotated
    footprints still go through attemptPlacement. */
 function packInterval(g,iv,ctx){
  const pitch=ctx.par.alongPitch;
  const cap=Math.floor((iv.hi-iv.lo)/pitch)+1;
  const run=st=>{
   const placed=[],added=[];
   for(let k=0;k<80;k++){
    const s=st.s+st.dir*k*pitch;
    if(s<iv.lo-1e-9||s>iv.hi+1e-9)break;
    ctx.attempts++;
    const res=attemptPlacement(g,s,ctx,placed);
    if(!res.ok){
     ctx.rejects.byReason[res.reason]=(ctx.rejects.byReason[res.reason]||0)+1;
     continue;}
    added.push(commitVilla(g,res,ctx,placed));}
   const snap=placed.map(cloneUnit);
   for(const u of added)ctx.index.remove(u);
   ctx.units=ctx.units.filter(u=>added.indexOf(u)<0);
   return {n:placed.length,units:snap,st};};
  let best={n:-1,units:[],st:null};
  for(const st of intervalStarts(iv,pitch)){
   const got=run(st);
   if(got.n>best.n)best=got;
   if(best.n>=cap)break;}
  if(best.st&&best.n<cap){
   for(const d of [-2,-1,1,2]){
    const s=best.st.s+d;
    if(s<iv.lo-1e-9||s>iv.hi+1e-9)continue;
    const got=run({s,dir:best.st.dir});
    if(got.n>best.n)best=got;
    if(best.n>=cap)break;}}
  const out=[];
  for(const u of best.units){
   const nu=cloneUnit(u);
   nu.order=out.length;nu.row=g.id;
   ctx.units.push(nu);ctx.index.add(nu);out.push(nu);}
  return out;}
 function packRowIntervals(g,ctx,release){
  const ivs=intervalsOf(g,release);
  const row=[];
  for(const iv of ivs){
   const got=packInterval(g,iv,ctx);
   for(const u of got){u.order=row.length;row.push(u);}}
  if(!row.length&&g.nodes&&g.nodes.length){
   const lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
   if(hi-lo>=ctx.par.width){
    ctx.attempts++;
    const res=attemptPlacement(g,(lo+hi)/2,ctx,[]);
    if(res.ok)commitVilla(g,res,ctx,row);}}
  return row;}
 function rowCount(units,id){let n=0;for(const u of units)if(u.row===id)n++;return n;}
 /* Independent per-row interval packing against a frozen remainder. Restore the original
    row when the replacement does not strictly increase that row's count. */
 function densifyRows(units,guides,boundary,field,dropField,par,release){
  const report={tried:0,kept:0,gained:0};
  let cur=cloneUnits(units);
  const order=guides.slice().sort((a,b)=>rowCount(cur,a.id)-rowCount(cur,b.id)||a.id.localeCompare(b.id));
  for(const g of order){
   const before=rowCount(cur,g.id);
   const cap=intervalsOf(g,release).reduce((s,iv)=>s+Math.floor(Math.max(0,iv.hi-iv.lo)/par.alongPitch)+1,0);
   if(before>=cap)continue;
   report.tried++;
   const ctx=makePlaceCtx(cur.filter(u=>u.row!==g.id),boundary,field,dropField,par);
   packRowIntervals(g,ctx,release);
   const after=rowCount(ctx.units,g.id);
   if(after>before&&validate({units:ctx.units},boundary,par).ok){
    report.kept++;report.gained+=after-before;cur=cloneUnits(ctx.units);}
  }
  return {units:cur,report};}
 function enumerateCombos(n,offs){
  const out=[];
  const rec=arr=>{
   if(arr.length===n){out.push(arr.slice());return;}
   for(const o of offs){arr.push(o);rec(arr);arr.pop();}};
  rec([]);
  return out;}
 function packGroupWithOffsets(group,ctx,release,offsets,fromHi){
  const pitch=ctx.par.alongPitch;
  const placed=[];
  for(let i=0;i<group.length;i++){
   const g=group[i],ivs=intervalsOf(g,release),row=[];
   for(const iv of ivs){
    const s0=fromHi?iv.hi-offsets[i]:iv.lo+offsets[i];
    if(s0<iv.lo-1e-9||s0>iv.hi+1e-9)continue;
    const dir=fromHi?-1:1;
    for(let k=0;k<80;k++){
     const s=s0+dir*k*pitch;
     if(s<iv.lo-1e-9||s>iv.hi+1e-9)break;
     ctx.attempts++;
     const res=attemptPlacement(g,s,ctx,row);
     if(!res.ok){
      ctx.rejects.byReason[res.reason]=(ctx.rejects.byReason[res.reason]||0)+1;
      continue;}
     commitVilla(g,res,ctx,row);}}
   placed.push(row);}
  return placed;}
 function neighborGroups(guides,units,par){
  const list=guides.slice().sort((a,b)=>(a.offset||0)-(b.offset||0)||a.id.localeCompare(b.id));
  const leftover=g=>{
   const usable=(g.usable||[]).reduce((s,iv)=>s+(iv.hi-iv.lo),0);
   const n=rowCount(units,g.id);
   return usable-n*par.alongPitch;};
  const groups=[];
  for(let i=0;i<list.length;i++){
   if(i+1<list.length)groups.push(list.slice(i,i+2));
   if(i+2<list.length)groups.push(list.slice(i,i+3));}
  const ranked=groups.map(g=>{
   const slack=g.reduce((s,r)=>s+Math.max(0,leftover(r)),0);
   const sparse=g.reduce((s,r)=>s+(rowCount(units,r.id)<=2?1:0),0);
   return {g,slack,sparse,n:g.length};})
   .filter(x=>x.slack>=par.alongPitch*0.8||x.sparse>0)
   .sort((a,b)=>b.slack-a.slack||b.sparse-a.sparse||a.n-b.n);
  return ranked.slice(0,8).map(x=>x.g);}
 /* Unlock two or three neighbouring row segments together. Intermediate counts may drop;
    only the best valid replacement is kept, and only if it beats the original patch. */
 function densifyNeighborhoods(units,guides,boundary,field,dropField,par,release){
  const report={tried:0,kept:0,gained:0};
  let cur=cloneUnits(units);
  const ids=g=>g.map(r=>r.id).join('+');
  const seen=new Set();
  const offs=[0,par.alongPitch/3,2*par.alongPitch/3];
  let spent=0;
  const groups=neighborGroups(guides,cur,par).slice(0,4);
  for(const group of groups){
   if(spent>1200)break;
   const key=ids(group);
   if(seen.has(key))continue;
   seen.add(key);
   report.tried++;
   const idSet=new Set(group.map(r=>r.id));
   const original=cur.filter(u=>idSet.has(u.row));
   const fixed=cur.filter(u=>!idSet.has(u.row));
   const baseN=original.length;
   let best=null,bestN=baseN;
   const combos=enumerateCombos(group.length,offs);
   const dirs=group.length===2?[false,true]:[false];
   for(const fromHi of dirs){
    for(const combo of combos){
     if(spent>1200)break;
     const ctx=makePlaceCtx(cloneUnits(fixed),boundary,field,dropField,par);
     packGroupWithOffsets(group,ctx,release,combo,fromHi);
     spent+=ctx.attempts;
     const n=ctx.units.length-fixed.length;
     if(n>bestN&&validate({units:ctx.units},boundary,par).ok){
      bestN=n;best=cloneUnits(ctx.units);}}}
   if(best){report.kept++;report.gained+=bestN-baseN;cur=best;}
  }
  return {units:cur,report};}
 function guideTooClose(a,guides,minSep){
  for(const h of guides){
   if(h===a)continue;
   for(const n of a.nodes){
    for(const m of h.nodes){
     if(Math.hypot(n.x-m.x,n.y-m.y)<minSep)return true;}}}
  return false;}
 function makeSibling(g,sign,field,boundary,par,nextId){
  const src=retangent(g.nodes.map(n=>({x:n.x,y:n.y,s:n.s,tx:n.tx,ty:n.ty})));
  const pieces=offsetStations(src,sign*par.acrossPitch,{boundary,maxFold:par.maxFold});
  let best=null,bestLen=0;
  for(const pc of pieces){
   if(pc.length<3)continue;
   const nodes=canonicalNodes(retangent(pc.map(p=>({x:p.x,y:p.y,s:p.s,tx:p.tx,ty:p.ty}))));
   if(nodes.length<3)continue;
   const len=nodes[nodes.length-1].s-nodes[0].s;
   if(len>bestLen){bestLen=len;best=nodes;}}
  if(!best||bestLen<par.alongPitch*0.8)return null;
  const mid=best[Math.floor(best.length/2)];
  const fn=field.normalAt(mid.x,mid.y);
  if(fn){
   const rn=[-mid.ty,mid.tx];
   const dot=Math.abs(fn[0]*rn[0]+fn[1]*rn[1]);
   const ang=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
   if(ang>40)return null;}
  const mask=usableIntervals(best,field,boundary,par);
  if(!mask.intervals.length)return null;
  let sx=0,sy=0;for(const n of best){sx+=n.tx;sy+=n.ty;}
  const m=Math.hypot(sx,sy);
  return {id:nextId,family:g.family,level:field.zAt(mid.x,mid.y),
   offset:(g.offset||0)+sign*par.acrossPitch,nodes:best,
   usable:mask.intervals,usableRaw:mask.intervals.map(iv=>({lo:iv.lo,hi:iv.hi})),
   length:bestLen,delta:g.delta,spineId:g.spineId,siblingOf:g.id,
   famAxis:m>1e-9?[sx/m,sy/m]:null,unverified:mask.unverified||0};}
 /* If a pocket has no guide but a parallel sibling of an existing row can hold villas,
    add that sibling — still a row, not a scatter. Same net-gain gate. */
 function densifySiblings(units,guides,boundary,field,dropField,par,release){
  const report={tried:0,kept:0,gained:0,added:[]};
  let cur=cloneUnits(units);
  const live=guides.slice();
  let serial=guides.reduce((n,g)=>{
   const m=/^R(\d+)$/.exec(g.id);return m?Math.max(n,Number(m[1])):n;},0);
  const minSep=par.depth+par.backClear-0.2;
  const originals=guides.slice();
  for(const g of originals){
   for(const sign of [1,-1]){
    if(report.added.length>=4)break;
    report.tried++;
    const nextId='R'+String(++serial).padStart(2,'0');
    const sib=makeSibling(g,sign,field,boundary,par,nextId);
    if(!sib){serial--;continue;}
    /* Footprint checks decide local fit. */
    const ctx=makePlaceCtx(cloneUnits(cur),boundary,field,dropField,par);
    packRowIntervals(sib,ctx,release);
    const gained=ctx.units.length-cur.length;
    if(gained>0&&validate({units:ctx.units},boundary,par).ok){
     report.kept++;report.gained+=gained;report.added.push(sib.id);
     cur=cloneUnits(ctx.units);live.push(sib);}
    else serial--;}
   if(report.added.length>=4)break;}
  return {units:cur,guides:live,report};}
 function annotateEmpty(guides,units,boundary,field,dropField,par){
  for(const g of guides){
   if(rowCount(units,g.id)){g.emptyReason=null;continue;}
   const ctx=makePlaceCtx(cloneUnits(units),boundary,field,dropField,par);
   const reasons={};
   const lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
   for(let s=lo;s<=hi;s+=Math.max(3,par.stationStep)){
    if(g.usable&&!inUsable(g.usable,s)){reasons.notUsable=(reasons.notUsable||0)+1;continue;}
    const r=attemptPlacement(g,s,ctx,[]);
    reasons[r.ok?'fitsNow':r.reason]=(reasons[r.ok?'fitsNow':r.reason]||0)+1;}
   let top='unexplored',n=0;
   for(const k of Object.keys(reasons))if(reasons[k]>n){n=reasons[k];top=k;}
   g.emptyReason=top;}}
 function probeFootprint(x,y,field,dropField,boundary,par,units){
  const face=field.facing(x,y);
  const info=field.zInfo?field.zInfo(x,y):null;
  if(!face)return {isolated:false,withNeighbors:false,reason:(info&&info.status)||'no-facing',terrain:info&&info.status};
  const poly=rect([x,y],face.downhill,par.width,par.depth);
  if(!polyInsideBoundary(poly,boundary))return {isolated:false,withNeighbors:false,reason:'boundary',view:face.downhill,terrain:info&&info.status};
  const drop=groundDrop(dropField,[x,y],face.downhill,par.depth,par.width);
  if(!drop.ok)return {isolated:false,withNeighbors:false,reason:'direction',view:face.downhill,terrain:info&&info.status};
  const ctx={par,boundary,index:makeIndex(Math.max(par.alongPitch,par.acrossPitch))};
  for(const u of units||[])ctx.index.add(u);
  const bad=checkCandidate([x,y],face.downhill,ctx);
  return {isolated:true,withNeighbors:!bad,reason:bad?bad.reason:null,view:face.downhill,poly,terrain:info&&info.status};}
 function densifyLayout(layout,guides,boundary,field,dropField,par,opts){
  const cfg=opts&&opts.densify;
  const off=cfg===false;
  const packRows=off?false:(cfg&&cfg.packRows===false?false:true);
  const repack=off?false:(cfg&&cfg.repackNeighbors===false?false:true);
  const siblings=off?false:(cfg&&cfg.siblings===false?false:true);
  const release=off?false:(cfg&&cfg.releaseUnused===false?false:true);
  const baseline=cloneUnits(layout.units);
  const report={baseline:baseline.length,packed:null,repacked:null,siblings:null,
   pack:{tried:0,kept:0,gained:0},neighborhood:{tried:0,kept:0,gained:0},
   sibling:{tried:0,kept:0,gained:0,added:[]},released:release,applied:false};
  let units=baseline,live=guides.slice();
  if(packRows){
   const r=densifyRows(units,live,boundary,field,dropField,par,release);
   report.pack=r.report;units=r.units;report.packed=units.length;}
  if(repack){
   const r=densifyNeighborhoods(units,live,boundary,field,dropField,par,release);
   report.neighborhood=r.report;units=r.units;report.repacked=units.length;}
  if(siblings){
   const r=densifySiblings(units,live,boundary,field,dropField,par,release);
   report.sibling=r.report;units=r.units;live=r.guides;report.siblings=units.length;}
  const ok=validate({units},boundary,par).ok;
  if(!ok||units.length<baseline.length){
   annotateEmpty(guides,baseline,boundary,field,dropField,par);
   return {units:baseline,guides,report:Object.assign(report,{applied:false,reverted:ok?'no-gain':'invalid'})};}
  report.applied=units.length>baseline.length;
  annotateEmpty(live,units,boundary,field,dropField,par);
  return {units,guides:live,report};}
 /* Generate a full arrangement. Bounded, deterministic search over complete alternatives
    (along-row phase x traversal direction), then a row-based gap-recovery pass on the winner,
    then a geometry-only densify pass that is kept only on a validated net gain.
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
  const families=buildGuideFamilies(field,boundary,par,smoothed);
  if(!families.length)return {ok:false,error:'no row guides could be derived from this terrain',
   units:[],rows:[],
   rejects:{byReason:{unverified:1,direction:1},details:[]},
   recovery:{added:[],tried:0,failed:[],byClass:{noFit:0,neighborsFixed:0,unverified:1,other:0}}};
  const variants=[];
  for(const fam of families){
   for(const phase of [0,par.alongPitch/3,2*par.alongPitch/3])for(const dir of [1,-1]){
    const v=runVariant(fam.guides,boundary,field,dropField,par,phase,dir,par.maxUnits);
    const rows=rowsOf(v.units,fam.guides,par);
    const validation=validate({units:v.units,rows},boundary,par);
    const met=metrics({units:v.units,rows},boundary,field,par,{rejects:v.rejects,attempts:v.attempts,validation});
    variants.push({units:v.units,rows,rejects:v.rejects,attempts:v.attempts,validation,metrics:met,
     phase,dir,delta:fam.delta,guides:fam.guides,spineId:fam.spineId});}}
  const viable=variants.filter(v=>v.validation.ok);
  const pool=viable.length?viable:variants.slice();
  /* priority: hard requirements pass (viable first) -> more villas -> less unnecessary
     spacing -> less heading jitter -> deterministic tie-break. No weighted score, so extra
     villas can never buy a broken constraint. Across-row phase (delta) is a first-class
     search axis so a 50 m gap can be reorganised to ~31 m packing, not only left empty. */
  pool.sort((a,b)=>b.units.length-a.units.length||
   a.metrics.spacing.extraSpacing-b.metrics.spacing.extraSpacing||
   a.metrics.heading.jitter-b.metrics.heading.jitter||
   a.delta-b.delta||a.phase-b.phase||a.dir-b.dir);
  const winner=pool[0];
  const units=winner.units;
  const recovery=recover({units},boundary,field,dropField,par,winner.guides);
  const densified=densifyLayout({units},winner.guides,boundary,field,dropField,par,opts||{});
  /* Safety net. Placement and repair already enforce every requirement, but the delivered
     layout is judged by the INDEPENDENT validator, so anything it still rejects is removed
     here — and reported, never silently accepted. */
  const holder={units:densified.units};
  const pruned=prune(holder,boundary,par);
  const rows=rowsOf(holder.units,densified.guides,par);
  const layout={units:holder.units,rows,params:par};
  const validation=validate(layout,boundary,par);
  const met=metrics(layout,boundary,field,par,{rejects:winner.rejects,attempts:winner.attempts,validation,gaps:recovery.failed});
  const okFinal=validation.ok&&layout.units.length>0;
  const pipeline=(densified.guides||[]).map(g=>{
   const usable=(g.usable||[]).reduce((s,iv)=>s+(iv.hi-iv.lo),0);
   const placed=holder.units.filter(u=>u.row===g.id).length;
   return {id:g.id,length:Number((g.length||0).toFixed(1)),usable:Number(usable.toFixed(1)),
    placed,emptyReason:g.emptyReason||null};});
  return {ok:okFinal,
   error:okFinal?null:(layout.units.length?'generated layout failed independent validation'
    :'no villa could be placed on this terrain (rejections: '+JSON.stringify(met.rejects.byReason)+')'),
   units:layout.units,rows,params:par,validation,metrics:met,rejects:winner.rejects,recovery,pruned,
   densify:densified.report,pipeline,
   budget:{variants:variants.length,attempts:winner.attempts,recoveryTries:recovery.tried,
    viableVariants:viable.length,acrossRowPhases:families.length,
    densifyApplied:!!(densified.report&&densified.report.applied),
    counts:variants.map(v=>({phase:Number(v.phase.toFixed(1)),dir:v.dir,delta:Number(v.delta.toFixed(2)),
     units:v.units.length,ok:v.validation.ok}))},
   guides:{count:densified.guides.length,dropped:0,delta:winner.delta,usableLength:families.find(f=>f.delta===winner.delta&&f.spineId===winner.spineId)?families.find(f=>f.delta===winner.delta&&f.spineId===winner.spineId).usableLength:null},
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
  const out={added:[],tried:0,failed:[],byClass:{noFit:0,neighborsFixed:0,unverified:0,other:0}};
  const ctx={units:layout.units,index:makeIndex(Math.max(par.alongPitch,par.acrossPitch)),
   rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField,maxUnits:par.maxUnits+40};
  for(const u of layout.units)ctx.index.add(u);
  const classify=reason=>{
   if(reason==='unverified')return 'unverified';
   if(reason==='boundary')return 'noFit';
   if(reason==='overlap'||reason==='side'||reason==='rear')return 'neighborsFixed';
   return 'other';};
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
     if(g.usable&&!inUsable(g.usable,s)){
      out.byClass.noFit++;out.failed.push({row:g.id,at:Number(s.toFixed(1)),reason:'boundary',class:'noFit'});
      continue;}
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
     else{
      const cls=classify(res.reason);
      out.byClass[cls]++;
      out.failed.push({row:g.id,at:Number(s.toFixed(1)),reason:res.reason,class:cls});}}}}
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
  stations,curvature,smoothPath,spineNormals,offsetStations,selfCuts,guidePointAt,arcOf,inUsable,splitByTurn,
  buildGuides,buildGuideFamilies,usableIntervals,
  makeIndex,checkCandidate,attemptPlacement,redistribute,placeRow,alignStart,withinTol,
  generate,generateLayout,rowsOf,runVariant,recover,prune,metrics,validate,verify,downhillAt,
  densifyLayout,packRowIntervals,intervalStarts,probeFootprint,
  SMOOTH_MAX,smoothContours,resample,chaikin};
})();
if(typeof module!=='undefined')module.exports=ParallelPara;
