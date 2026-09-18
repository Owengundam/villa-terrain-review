/* parallelPara: procedural initial population from site geometry + smoothed terrain.
   No AI-image input, no image-derived seeds. Also hosts terrain smoothing (contour
   simplification that preserves the broad hillside structure) and the rear-exclusion
   strip rule. All geometry deterministic. */
const ParallelPara=(()=>{
 /* ---- terrain smoothing ----
   Two stages, always recomputed from the ORIGINAL source (never from a previously
   smoothed result). Stage 1: resample each contour at a fixed arc-length step that
   grows with the smoothing level — this removes tiny kinks at the building scale
   (the sampling cannot represent features smaller than the step). Stage 2: one
   Chaikin corner-cut round per level to soften the resampled corners. Level 0 =
   original polyline. Elevations and endpoints are preserved per line. */
 function resample(points,step){
  if(points.length<3||step<=0)return points.map(p=>p.slice());
  const out=[points[0].slice()];let acc=0;
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
    out.push([a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75]);
   }
   out.push(p[p.length-1].slice());
   p=out;
  }
  return p;}
 function smoothContours(contours,level){
  const lvl=Math.max(0,Math.min(6,Math.round(level))); // 0..6
  if(!lvl)return contours.map(c=>({...c,points:c.points.map(p=>p.slice())}));
  const step=2+lvl*2; // 4..14 m resample step: building-scale smoothing
  return contours.map(c=>({...c,points:chaikin(resample(c.points,step),1)}));
 }
 /* Downhill direction from the SMOOTHED field: nearest two distinct-level points on the
   smoothed polylines; downhill = from the higher level toward the lower. Deterministic
   fallback when the two nearest levels tie: use the second-nearest distinct level. */
 function downhillAt(x,y,smoothedLines){
  const cand=[];
  for(const l of smoothedLines){
   const pts=l.controls||l.points; // accept both line formats
   for(const p of pts){
    const d=(p[0]-x)*(p[0]-x)+(p[1]-y)*(p[1]-y);
    cand.push([d,l.z,p]);}}
  cand.sort((a,b)=>a[0]-b[0]);
  // The nearest level group defines the local height; then find the nearest level
  // BELOW it (scan past any higher/equal groups). 1 cm tie groups equal levels.
  let here=null,lower=null;
  for(const [d,z] of cand){
   if(here===null){here=z;continue;}
   if(z<here-0.01){lower=z;break;}
   // equal or higher level: still looking for a lower one
  }
  if(here===null||lower===null)return null; // no lower contour found: caller falls back
  // average direction toward the 3 nearest samples of the lower level
  const lowerPts=[];
  for(const [d,z,p] of cand){
   if(Math.abs(z-lower)<=0.01)lowerPts.push([d,p]);
   if(lowerPts.length>=3)break;}
  let vx=0,vy=0;
  for(const [d,p] of lowerPts){
   const dd=Math.hypot(p[0]-x,p[1]-y)||1;
   vx+=(p[0]-x)/dd;vy+=(p[1]-y)/dd;}
  const m=Math.hypot(vx,vy);
  if(m<1e-6)return null;
  return [vx/m,vy/m];}
 /* ---- geometry helpers ---- */
 function rotatePoints(points,center,ang){
  const c=Math.cos(ang),s=Math.sin(ang);
  return points.map(p=>{const dx=p[0]-center[0],dy=p[1]-center[1];return [center[0]+dx*c-dy*s,center[1]+dx*s+dy*c];});}
 function pointInPoly(p,poly){let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
   const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
   if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi))inside=!inside;}
  return inside;}
 function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
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
 /* Directional side clearance: strict >3 m gap. Faithful implementation of the
   directional rule: the pair must be separated by >3 m along at least one villa's
   local side axis OR have >3 m polygon distance overall. Villas separated
   front-to-back (one behind another) are governed by the rear-strip rule, not the
   side rule — on curved rows their side-axis projections legitimately overlap. */
 function sideGapOK(a,b,gap=3,tol=1e-6){
  // actual 3D-equivalent plan separation: if polygons are farther apart than the gap
  // in plain distance, the side rule is satisfied regardless of direction
  if(polyDist(a.points,b.points)>gap+tol)return true;
  const frames=[a,b];
  for(const u of frames){
   const v=u.view,side=[v[1],-v[0]];
   const pa=a.points.map(p=>[(p[0]-u.center[0])*side[0]+(p[1]-u.center[1])*side[1],(p[0]-u.center[0])*v[0]+(p[1]-u.center[1])*v[1]]);
   const pb=b.points.map(p=>[(p[0]-u.center[0])*side[0]+(p[1]-u.center[1])*side[1],(p[0]-u.center[0])*v[0]+(p[1]-u.center[1])*v[1]]);
   const aMin=Math.min(...pa.map(p=>p[0])),aMax=Math.max(...pa.map(p=>p[0]));
   const bMin=Math.min(...pb.map(p=>p[0])),bMax=Math.max(...pb.map(p=>p[0]));
   const sep=Math.max(aMin-bMax,bMin-aMax); // positive when separated along side axis
   if(sep>gap+tol)return true;}
  return false;}
 /* Rear exclusion strip: rectangle behind the rear facade, full width, `clear` deep.
   Intrusion test: any corner of the other footprint inside the strip, or any strip
   corner inside the other footprint, or actual polygon intersection via distance 0. */
 function rearStrip(u,clear){
  const v=u.view; // view points downhill = front direction; rear is opposite
  const rear=[-v[0],-v[1]];
  // rear facade corners: the two footprint corners at the -view end (projection onto view)
  const back=u.points.filter(p=>(p[0]-u.center[0])*v[0]+(p[1]-u.center[1])*v[1]<0);
  const r1=back[0],r2=back[1];
  const s1=[r1[0]+rear[0]*clear,r1[1]+rear[1]*clear];
  const s2=[r2[0]+rear[0]*clear,r2[1]+rear[1]*clear];
  return [r1.slice(),r2.slice(),s2,s1];}
 function stripIntrusion(strip,poly){
  for(const p of strip)if(pointInPoly(p,poly))return true;
  for(const p of poly)if(pointInPoly(p,strip))return true;
  return polyDist(strip,poly)===0;}
 function rearConflict(a,b,clear,tol=1e-6){
  // B intrudes into A's strip AND A into B's strip — check both directions.
  const stripA=rearStrip(a,clear);
  if(stripIntrusion(stripA,b.points))return 'A';
  const stripB=rearStrip(b,clear);
  if(stripIntrusion(stripB,a.points))return 'B';
  return null;}
 /* ---- parallelPara generation ----
   Rows follow the smoothed contours: seed points walk the smoothed line of the row's
   level; villa headings = local downhill from the smoothed field; positions slide
   along the row to satisfy clearances. Deterministic. */
 function rectangle(center,view,w=11,d=23){
  const side=[view[1],-view[0]];
  return [[-w/2*side[0]-d/2*view[0],-w/2*side[1]-d/2*view[1]],
          [w/2*side[0]-d/2*view[0],w/2*side[1]-d/2*view[1]],
          [w/2*side[0]+d/2*view[0],w/2*side[1]+d/2*view[1]],
          [-w/2*side[0]+d/2*view[0],-w/2*side[1]+d/2*view[1]]].map(p=>[center[0]+p[0],center[1]+p[1]]);}
 function generate(data,opts){
  const {smoothed,sideGap=3,backClear=7}=opts;
  const boundary=data.boundary;
  const inside=poly=>poly.every(p=>pointInPoly(p,boundary));
  // group smoothed contours into rows by level, walk each as a row spine
  const rows=[];
  const byLevel=new Map();
  for(const c of smoothed)if(!byLevel.has(c.z))byLevel.set(c.z,[]);
  for(const c of smoothed)byLevel.get(c.z).push(c);
  const levels=[...byLevel.keys()].sort((a,b)=>a-b);
  let rowIdx=0;const units=[];const rowMeta=[];
  // villa orientation = smoothed-field downhill; fall back to neighbour row direction
  const headingAt=(x,y,rowsSoFar)=>{
   let d=downhillAt(x,y,smoothed);
   if(d)return d;
   if(rowsSoFar.length){const last=rowsSoFar[rowsSoFar.length-1];if(last.length)return last[last.length-1].view.slice();}
   return [0,-1];};
  const occupied=[];
  const conflictFree=(poly,view)=>{
   if(!inside(poly))return false;
   const me={center:[poly.reduce((s,p)=>s+p[0],0)/4,poly.reduce((s,p)=>s+p[1],0)/4],view:view.slice(),points:poly};
   for(const o of occupied){
    if(polyDist(poly,o.points)===0)return false;
    if(!sideGapOK(me,o,sideGap))return false;
    if(stripIntrusion(rearStrip(o,backClear),poly))return false;
    if(stripIntrusion(rearStrip(me,backClear),o.points))return false;}
   return true;};
  // Multiple downhill offsets per level: bands every ~33 m (23 depth + 7 rear + 3
  // clearance) from each contour spine. Conflict checks filter overlaps between
  // neighbouring levels' bands; passing all bands would double-place, but the
  // conflict check prevents that — later levels simply fill the gaps left open.
  for(let li=0;li<levels.length;li++){
   const z=levels[li];
   // use ALL contours of this level as spines (not just the longest)
   for(const line of byLevel.get(z)){
    const spine=line.points;
    if(spine.length<2)continue;
    // cumulative arc length along the spine for even stepping
    const arc=[0];
    for(let k=1;k<spine.length;k++)arc.push(arc[k-1]+Math.hypot(spine[k][0]-spine[k-1][0],spine[k][1]-spine[k-1][1]));
    const total=arc[arc.length-1];
    if(total<10)continue;
    for(const rowOff of [0,33,66]){
     let placedInRow=0;
     const STEP=15; // 11 m width + 3 m clearance + 1 m margin between villa centres
     // Nudge candidate positions inside: when the rectangle pokes out of the boundary,
     // slide it back along the downhill axis (up to 6 m in 1.5 m steps) before giving up.
     for(let d=STEP/2;d<total-STEP/2;d+=STEP){
      let k=arc.findIndex(a=>a>=d);if(k<1)k=1;
      const base=spine[k];
      const view=headingAt(base[0],base[1],occupied);
      if(!view)continue;
      const k2=Math.min(k+1,spine.length-1);
      const tangent=[Math.sign(spine[k2][0]-base[0]||1),Math.sign(spine[k2][1]-base[1]||1)];
      for(const slide of [0,2,-2,4,-4,6,-6,8,-8,10,-10]){
       const sx=base[0]+tangent[0]*slide,sy=base[1]+tangent[1]*slide;
       const vh=headingAt(sx,sy,occupied);
       if(!vh)continue;
       // try the offset position, then slide BACK uphill (opposite the view) up to 6 m
       // so edge-of-boundary candidates pull inside instead of being discarded
       for(const back of [0,1.5,3,4.5,6]){
        const center=[sx+vh[0]*(rowOff-back),sy+vh[1]*(rowOff-back)];
        const poly=rectangle(center,vh);
        if(!conflictFree(poly,vh))continue;
        const id='P'+String(units.length+1).padStart(3,'0');
        units.push({id,name:id,center:center.slice(),view:vh.slice(),points:poly,
                    row:rowIdx,order:placedInRow,reference:null,active:true});
        occupied.push({center:center.slice(),view:vh.slice(),points:poly});
        placedInRow++;
        break;
       }
       if(placedInRow>0&&units.length&&units[units.length-1].row===rowIdx&&units[units.length-1].order===placedInRow-1)break;
      }
     }
     rowMeta.push({row:rowIdx,level:z,placed:placedInRow,offset:rowOff});
     rowIdx++;
    }
   }
  }
  return units;
 }
 /* independent verification of a generated arrangement */
 function verify(units,boundary,sideGap,backClear){
  const issues=[];
  for(const u of units){
   if(!u.points.every(p=>pointInPoly(p,boundary)))issues.push({type:'boundary',id:u.id});}
  for(let i=0;i<units.length;i++)for(let j=i+1;j<units.length;j++){
   const a=units[i],b=units[j];
   if(polyDist(a.points,b.points)===0)issues.push({type:'overlap',a:a.id,b:b.id});
   if(!sideGapOK(a,b,sideGap))issues.push({type:'side',a:a.id,b:b.id});
   if(stripIntrusion(rearStrip(a,backClear),b.points))issues.push({type:'rear',a:a.id,b:b.id});
   else if(stripIntrusion(rearStrip(b,backClear),a.points))issues.push({type:'rear',a:b.id,b:a.id});}
  return {issues,ok:!issues.length,count:units.length};}
 return {smoothContours,downhillAt,rotatePoints,pointInPoly,polyDist,sideGapOK,rearStrip,stripIntrusion,rearConflict,generate,verify};
})();
if(typeof module!=='undefined')module.exports=ParallelPara;
