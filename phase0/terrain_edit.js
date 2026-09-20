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
 /* ---- orientation authority: the contour LEVELS, not the interpolated field ----
   The IDW field (inverse-distance-squared over sampled contour points) forms local dips
   between lines. A symmetric ±11.5 m probe can straddle such a dip, so its verdict flips
   with a few metres of drift, and villas that already face downhill get reversed — the
   user reads the plan against the contour labels and sees arrows pointing up.
   Level authority instead: find the villa's nearest contour level, then the nearest level
   BELOW it; the arrow has an uphill component when it opposes that direction. Same
   authority ParallelPara uses for population, so placement and correction agree.
   Returns null when no lower level is in reach (caller falls back to the 23 m drop). */
 function levelDownhill(x,y,pts){
  const cand=[];
  for(const p of pts){const dx=p[0]-x,dy=p[1]-y;cand.push([dx*dx+dy*dy,p[2],p]);}
  cand.sort((a,b)=>a[0]-b[0]);
  let here=null,lower=null;
  for(const [,z] of cand){if(here===null){here=z;continue;}if(z<here-0.01){lower=z;break;}}
  if(here===null||lower===null)return null;
  const lowerPts=[];
  for(const [,z,p] of cand){if(Math.abs(z-lower)<=0.01)lowerPts.push(p);if(lowerPts.length>=3)break;}
  let vx=0,vy=0;
  for(const p of lowerPts){const d=Math.hypot(p[0]-x,p[1]-y)||1;vx+=(p[0]-x)/d;vy+=(p[1]-y)/d;}
  const m=Math.hypot(vx,vy);
  return m<1e-6?null:[vx/m,vy/m];
 }
 /* The authority the user actually reads: the contour LABELS. For a few distances along
    the arrow, compare the z of the nearest contour sample ahead of the villa with the
    nearest one behind it — positive means the arrow runs toward higher labels, which is
    what "pointing uphill" looks like on the plan. Samples come from samples(lines) at 4 m
    spacing, so the nearest sample tracks the nearest contour line the way the drawn
    labels do. The physical reads below only break ties. */
 function nearestZ(p,pts){
  let best=Infinity,z=null;
  for(const q of pts){const dx=q[0]-p[0],dy=q[1]-p[1],d=dx*dx+dy*dy;if(d<best){best=d;z=q[2];}}
  return z;
 }
 function labelVote(u,pts,dir,distances=[5,10,15,20,25,30,35,40,45]){
  const d=dir||u.view;
  let vote=0,used=0;
  for(const s of distances){
   const f=nearestZ([u.center[0]+d[0]*s,u.center[1]+d[1]*s],pts);
   const b=nearestZ([u.center[0]-d[0]*s,u.center[1]-d[1]*s],pts);
   if(f===null||b===null)continue;
   vote+=Math.sign(f-b);used++;
  }
  return {vote,used};
 }
 /* Does this villa's arrow point uphill?
     1. label vote >= +2 / <= -2 decides (the user's own read);
     2. otherwise (ambiguous labels: flat, hollow or saddle spots) two physical reads must
        AGREE that it is uphill — the contour LEVEL scan (arrow opposes the direction to
        the nearest lower level) AND the integrated ±40 m drop (ground ahead higher than
        behind). Each physical read alone misjudges: the level scan follows a lower line
        that can sit laterally or only one level down (staggered-2 V043), and any short
        field probe straddles the local dips of the interpolated surface (the ±11.5 m
        rule that reversed 30 of 226 arrows, staggered-2 V073/V078 among them).
    Never reverse a villa the labels read as downhill; leaving an ambiguous one alone is
    the cheaper error. */
 function pointsUphill(u,pts){
  const {vote,used}=labelVote(u,pts);
  const d=levelDownhill(u.center[0],u.center[1],pts);
  const level=d?(u.view[0]*d[0]+u.view[1]*d[1])<0:null;
  const zf=elevation(u.center[0]+u.view[0]*40,u.center[1]+u.view[1]*40,pts);
  const zb=elevation(u.center[0]-u.view[0]*40,u.center[1]-u.view[1]*40,pts);
  const drop=zf>zb+0.05;
  const physical=level===null?drop:(level&&drop);
  const decided=used===0?null:(vote>=2?true:vote<=-2?false:null);
  return {uphill:decided===null?physical:decided,vote,used,level,drop,dir:d};
 }
 /* Pure 180° flip: the long axis stays perpendicular to the contour, the arrow reverses. */
 function flip(u){
  const ang=Math.PI,c=Math.cos(ang),s=Math.sin(ang);
  return {...u,view:[-u.view[0],-u.view[1]],
   points:u.points.map(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return [u.center[0]+dx*c-dy*s,u.center[1]+dx*s+dy*c];}),
   rotation:(u.rotation||0)+ang};
 }
 /* Rigid rotation about the villa centre for any angle: footprint and arrow turn together
    (coupled orientation), the centre and the reference pad stay put. */
 function rotateAbout(u,ang){
  const c=Math.cos(ang),s=Math.sin(ang);
  return {...u,view:[u.view[0]*c-u.view[1]*s,u.view[0]*s+u.view[1]*c],
   points:u.points.map(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return [u.center[0]+dx*c-dy*s,u.center[1]+dx*s+dy*c];}),
   rotation:(u.rotation||0)+ang};
 }
 /* Local contour frame: flat segment list over the control polylines, and the normal at a
    point — the direction 90° to the nearest contour segment. The planning rule puts the long
    axis ON that normal line; which way along it faces downhill is a separate decision. */
 function lineSegments(lines){
  const segs=[];
  for(const l of lines){const p=l.controls||l.points;for(let k=0;k+1<p.length;k++)segs.push({z:l.z,a:p[k],b:p[k+1]});}
  return segs;
 }
 function contourNormalAt(x,y,segs){
  let best=Infinity,n=null;
  for(const s of segs){
   const d=segDist([x,y],s.a,s.b);
   if(d<best){best=d;const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],m=Math.hypot(dx,dy);if(m>1e-9)n=[-dy/m,dx/m];}
  }
  return n;
 }
 /* Deviation of the long axis from the local contour normal, in degrees: 0 = the axis lies on
    the normal (either sense), 90 = the axis runs along the contour. */
 function axisDeviation(u,n){
  const dot=Math.max(-1,Math.min(1,Math.abs(u.view[0]*n[0]+u.view[1]*n[1])));
  return Math.acos(dot)*180/Math.PI;
 }
 /* Re-aim the long axis onto the local contour normal when it deviates by more than the
    perpendicular tolerance: the smallest rotation about the centre that puts the axis on the
    normal line, sense untouched (that is the flip's business). null = inside tolerance or no
    contour in reach. */
 function reaim(u,pts,segs,perpTol){
  const n=contourNormalAt(u.center[0],u.center[1],segs);
  if(!n)return null;
  if(axisDeviation(u,n)<=perpTol+1e-9)return null;
  const dot=u.view[0]*n[0]+u.view[1]*n[1];
  const target=dot>=0?n:[-n[0],-n[1]];
  const ang=Math.atan2(u.view[0]*target[1]-u.view[1]*target[0],Math.max(-1,Math.min(1,u.view[0]*target[0]+u.view[1]*target[1])));
  return {unit:rotateAbout(u,ang),delta:ang};
 }
 /* Re-aim every villa: (a) face uphill arrows downhill — mandatory, a planning rule, not a
    tolerance; (b) rotate every long axis further than the perpendicular tolerance off the
    local contour normal onto that normal. Both are rigid about the centre. A flip that would
    still leave the arrow uphill (degenerate spot) is refused. */
 function apply(data,lines,perpTol=0){
  const pts=samples(lines),segs=lineSegments(lines);
  return data.layouts.map(l=>({...l,units:l.units.map(u=>{
   let out=u;
   if(pointsUphill(u,pts).uphill){const f=flip(u);if(!pointsUphill(f,pts).uphill)out=f;}
   const r=reaim(out,pts,segs,perpTol);
   if(r)out=r.unit;
   return {...out,reference:elevation(out.center[0],out.center[1],pts)};
  })}));}
 /* How far each ACTIVE arrow sits from its local contour normal (the same reference reaim
   aims at: 90° to the nearest contour segment), for the perpendicular tolerance:
   0° = the axis IS the contour normal (either sense; the uphill sense is the flip's
   business), 90° = the axis runs along the contour and no rotation level can help.
   A level-scan reference would be wrong here — at some spots the nearest lower contour lies
   laterally, up to 90° away from the local normal. */
 function perpReport(layout,lines,tol=0,active){
  const segs=lineSegments(lines),act=active||layout.units.map(u=>u.active!==false);
  let count=0,total=0,worst=0;
  layout.units.forEach((u,i)=>{
   if(!act[i])return;
   const n=contourNormalAt(u.center[0],u.center[1],segs);
   if(!n)return;
   total++;
   const dev=axisDeviation(u,n);
   worst=Math.max(worst,dev);
   if(dev>tol+1e-9)count++;});
  return {count,total,worst};}
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
 /* Orientation deviation of a footprint's view from the local downhill, in degrees:
    level authority (0° = aimed straight down the local slope, 180° = aimed straight up
   it). 0 when the level scan finds nothing lower — unknown, not "correct". */
 function orientationError(u,pts){
  const d=levelDownhill(u.center[0],u.center[1],pts);
  if(!d)return 0;
  const dot=Math.max(-1,Math.min(1,u.view[0]*d[0]+u.view[1]*d[1]));
  return Math.acos(dot)*180/Math.PI;}
  /* Start fitting: legalize the arrangement — slide villas along facade/view axes to clear
   clearance/boundary conflicts, re-aim the villas at their new centres (uphill arrows are
   faced downhill; long axes further than perpTol off the local contour normal are rotated
   onto it), then shrink movements and re-aim once more at the final positions. Removal is
   NOT done here — ghosting stays with the view solver. cfg: sideGap (m), maxMove (m),
   perpTol (deg). Every accepted slide strictly reduces the total issue count, so the slide
   phase never makes the layout worse; flips and rotations are mandatory rule changes, and
   whatever they break is either repaired by an immediate slide round or reported in
   `remaining` for the page to ghost. `lines` is the contour control-line list (the same
   input apply() takes); samples and the contour frame are derived from it. */
 function fitLayout(l,boundary,lines,cfg={}){
  const sideGap=cfg.sideGap??SIDE_GAP,maxMove=cfg.maxMove??12,perpTol=cfg.perpTol??0;
  const pts=samples(lines),segs=lineSegments(lines);
  const units=l.units.map(u=>({...u,points:u.points.map(p=>p.slice()),center:u.center.slice()}));
  const moves=units.map(()=>({dx:0,dy:0,rot:0}));
  const centre=u=>u.points.reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/u.points.length);
  const live=()=>geomCheck({units},boundary,units.map(()=>true),sideGap);
  // Conflict + boundary repair in one loop: every accepted move must strictly
  // reduce the total issue count, so fitting never makes the layout worse.
  const slideRepair=()=>{
   let anyRepaired=false;
   for(let pass=0;pass<80;pass++){
    const g=live();
    if(!g.conflicts.length&&!g.issues.length)break;
    let repaired=false;
   const pairs=[...g.conflicts];
   const boundaryIdx=g.issues.filter(x=>x.type==='boundary').map(x=>x.i);
   // Baseline issue count for this pass. Every candidate below is judged against it, and
   // the loops all break on the first accepted move, so the value cannot go stale inside a
   // pass; recomputing it per candidate costs a full O(n²) geometry check each time.
   const before=g.conflicts.length+g.issues.length;
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
      if(tg.conflicts.length+tg.issues.length<before){
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
   anyRepaired=true;
  }
  return anyRepaired;
 };
  // 3. Orientation repair at the villas' CURRENT positions: a moved villa can sit where its
  //    (unchanged) view disagrees with the local contour frame. Two actions, both rigid about
  //    the centre:
  //      (a) face an uphill arrow downhill — a mandatory planning rule, not a tolerance;
  //      (b) rotate a long axis further than perpTol off the local contour normal onto it.
  //    Either can create clearance conflicts, so every change is followed by an immediate
  //    slide-repair round; villas that still cannot be legalised are reported in `remaining`
  //    and the page ghosts them.
  const reorientUnits=()=>{
   let changed=0;
   units.forEach((u,i)=>{
    let moved=false;
    if(pointsUphill(u,pts).uphill){
     const rotated=flip(u);
     if(!pointsUphill(rotated,pts).uphill){units[i]=rotated;moves[i].rot+=Math.PI;moved=true;} // degenerate spot: leave it
    }
    const r=reaim(units[i],pts,segs,perpTol);
    if(r){units[i]=r.unit;moves[i].rot+=r.delta;moved=true;}
    if(!moved)return;
    changed++;
    const tg=geomCheck({units},boundary,units.map(()=>true),sideGap);
    if(tg.conflicts.length||tg.issues.length){
     // the flip/rotation created conflicts: run one more slide-repair round immediately
     for(let pass=0;pass<40;pass++){
      const gg=geomCheck({units},boundary,units.map(()=>true),sideGap);
      if(!gg.conflicts.length&&!gg.issues.length)break;
      let fixedOne=false;
      // per-pass baseline, not per candidate: `units` is unchanged until a move is accepted
      // and every loop breaks immediately after that
      const b2=gg.conflicts.length+gg.issues.length;
      for(const [pi,pj] of gg.conflicts){
       for(const [aa] of [[pi],[pj]]){
        const uu=units[aa],vv=uu.view,ax=[vv[1],-vv[0]];
        const dirs=[[ax[0],ax[1]],[-ax[0],-ax[1]],[vv[0],vv[1]],[-vv[0],-vv[1]]];
        for(const [ux,uy] of dirs){
         for(const step of [4,2,1,.5]){
          const dx2=ux*step,dy2=uy*step;
          if(Math.hypot(moves[aa].dx+dx2,moves[aa].dy+dy2)>maxMove)continue;
          const tr2=units.map((q,k)=>k===aa?{...uu,center:[uu.center[0]+dx2,uu.center[1]+dy2],points:uu.points.map(p=>[p[0]+dx2,p[1]+dy2])}:q);
          const tg2=geomCheck({units:tr2},boundary,tr2.map(()=>true),sideGap);
          if(tg2.conflicts.length+tg2.issues.length<b2){
           units[aa]=tr2[aa];moves[aa].dx+=dx2;moves[aa].dy+=dy2;fixedOne=true;break;
          }
         }
         if(fixedOne)break;
        }
        if(fixedOne)break;
       }
       if(fixedOne)break;
      }
      if(!fixedOne)break;
     }
    }
   });
   return changed;
  };
  // 2. Alternate the two phases to convergence: aiming a villa at its contour normal can
  //    break clearance, and sliding it to repair clearance moves it off the normal again, so
  //    a single pass of each leaves a residual (11 of 19 active free-layout villas stayed
  //    outside ±15° with fixed two-pass ordering). Bounded rounds; whatever is still off the
  //    normal after them is reported (perpReport) rather than hidden.
  slideRepair();
  let reorientedTotal=0;
  for(let round=0;round<4;round++){
   const changed=reorientUnits();
   reorientedTotal+=changed;
   const g=live();
   if(!g.conflicts.length&&!g.issues.length)break;   // settled
   if(!slideRepair())break;                          // nothing moved: no point re-aiming again
   if(!changed)break;
  }
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
  // 5. Re-aim at the destination: shrinking translated villas again, and a slide across
  //    contours changes the local contour frame (move ⇒ re-aim, never aim-then-move-and-forget).
  reorientedTotal+=reorientUnits();
  const reference=units.map(u=>elevation(u.center[0],u.center[1],pts));
  const final=live();
  return {units:units.map((u,i)=>({...u,reference:reference[i]})),moves,
          reoriented:reorientedTotal,
          remaining:final.issues,ok:!final.issues.length};
 }
 return {MAX,simplify,buildFromContours,samples,elevation,downhill,levelDownhill,nearestZ,labelVote,pointsUphill,flip,rotateAbout,lineSegments,contourNormalAt,axisDeviation,reaim,apply,perpReport,diff,volume,polyDist,pointInPoly,geomCheck,orientationError,fitLayout,SIDE_GAP};
})();
if(typeof module!=='undefined')module.exports=TerrainEdit;
