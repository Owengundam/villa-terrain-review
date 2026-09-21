/* smoothing.js — shared-surface placement guidance (guidance only, never physics).
 *
 *   const Smoothing=require('./smoothing.js');
 *   const out=Smoothing.smoothContours(acceptedContours,level);        // drop-in
 *   const g=Smoothing.guidance(acceptedContours,level);                // + meta + gradient
 *   g.gradientAt(x,y) -> {dir:[dx,dy],conf,valid}                      // -grad(zGuide)
 *
 * Pipeline (spec 2026-09-20): accepted contours -> unsmoothed guidance height field z0
 * (2 m grid, arc-length samples, bracket interpolation between the two nearest distinct
 * levels) -> trend-preserving Gaussian smoothing (plane trend p + Gaussian of the residual,
 * mask-aware) -> marching-squares contours at the accepted levels -> the SAME polylines feed
 * display and population. The accepted/reference terrain, pad levels, cut/fill and boundary
 * are never touched by this module.
 *
 * Level -> sigma (proposed tuning values, not adopted rules): 0=off, 1=2 m, 2=5 m, 3=10 m,
 * 4=16 m, 5=24 m, 6=32 m. Level 0 returns deep copies of the accepted contours exactly —
 * no raster round trip. Every call recomputes from the source handed in; never smooth a
 * previous smoothing result.
 */
const Smoothing=(()=> {
'use strict';

const CELL=2;                       // working grid cell, metres (fixed, not strength-coupled)
const SAMPLE_STEP=1;                // arc-length sample spacing on source polylines, metres
const SIMPLIFY_TOL=0.25;            // Douglas-Peucker tolerance for output polylines, metres
const SIGMAS=[0,2,5,10,16,24,32];   // index = slider level 0..6
const NEAR_RADIUS0=6, NEAR_RADIUS_MAX=400;   // bracket search, metres — the cap must exceed
// the widest contour-free gap on the site, or NaN deserts fragment the extracted lines
const EDGE_PAD=36;                  // grid padding beyond data bbox, metres (>= 4*sigma@6/2+)

/* ---------- source sampling ---------- */
/* Canonical representation: reverse a line if its first differing point is lex-greater,
   and sort lines by (z, geometry). Reversed point order or shuffled line order then
   produce the IDENTICAL sample set, so the guidance is representation-invariant by
   construction (spec 5 test 4) — not merely approximately. */
function canonicalLines(contours){
 const norm=contours.map(c=>{
  const pts=(c.points||c.controls).map(p=>p.slice());
  let flip=0;
  for(let i=0;i<pts.length;i++){
   const a=pts[i],b=pts[pts.length-1-i];
   if(a[0]!==b[0]){flip=a[0]<b[0]?1:-1;break;}
   if(a[1]!==b[1]){flip=a[1]<b[1]?1:-1;break;}}
  return {z:c.z,pts:flip<0?pts.slice().reverse():pts};});
 norm.sort((a,b)=>{
  if(a.z!==b.z)return a.z-b.z;
  const n=Math.min(a.pts.length,b.pts.length);
  for(let i=0;i<n;i++){
   if(a.pts[i][0]!==b.pts[i][0])return a.pts[i][0]-b.pts[i][0];
   if(a.pts[i][1]!==b.pts[i][1])return a.pts[i][1]-b.pts[i][1];}
  return a.pts.length-b.pts.length;});
 return norm;}

/* True arc-length resampling: one sample per SAMPLE_STEP along the polyline, so original
   vertex density cannot weight one curve more than another (spec 3A). */
function arcSamples(points,z,out){
 if(points.length<2)return;
 let acc=0,px=points[0][0],py=points[0][1];
 out.push([px,py,z]);
 for(let i=1;i<points.length;i++){
  let qx=points[i][0],qy=points[i][1];
  let seg=Math.hypot(qx-px,qy-py);
  while(acc+seg>=SAMPLE_STEP){
   const t=(SAMPLE_STEP-acc)/seg;
   px+= (qx-px)*t; py+=(qy-py)*t;
   out.push([px,py,z]);
   seg=Math.hypot(qx-px,qy-py); acc=0;}
  acc+=seg; px=qx; py=qy;}
}

/* Bucket grid over samples for nearest-level queries. */
function sampleIndex(samples){
 const B=4,grid=new Map();
 samples.forEach((s,i)=>{
  const k=Math.floor(s[0]/B)+','+Math.floor(s[1]/B);
  if(!grid.has(k))grid.set(k,[]); grid.get(k).push(i);});
 function near(x,y,radius){
  const ci=Math.floor(x/B),cj=Math.floor(y/B),r=Math.ceil(radius/B),out=[],r2=radius*radius;
  for(let i=ci-r;i<=ci+r;i++)for(let j=cj-r;j<=cj+r;j++){
   const l=grid.get(i+','+j);if(!l)continue;
   for(const idx of l){const s=samples[idx],dx=s[0]-x,dy=s[1]-y,d2=dx*dx+dy*dy;
    if(d2<=r2)out.push({d:Math.sqrt(d2),z:s[2]});}}
  return out;}
 return {near};}

/* Contradiction report: 3+ distinct levels crowding one point means labels collide or a
   contour doubles back on itself inside the bucket — report, don't invent. */
function scanContradictions(samples,index){
 let flags=0;
 for(const s of samples){
  const lv=new Set();
  for(const e of index.near(s[0],s[1],2.5)){
   let known=false;for(const z of lv)if(Math.abs(z-e.z)<0.01)known=true;
   if(!known)lv.add(e.z);}
  if(lv.size>=3)flags++;}
 return flags;}

/* ---------- unsmoothed guidance field z0 on the fixed working grid ---------- */
function buildZ0(contours,bbox){
 const samples=[];
 for(const c of canonicalLines(contours))arcSamples(c.pts,c.z,samples);
 if(samples.length<4)throw new Error('smoothing: fewer than 4 samples of accepted contours — invalid input');
 const index=sampleIndex(samples);
 const contradictions=scanContradictions(samples,index);
 const nx=bbox.nx,ny=bbox.ny;
 const z=new Float64Array(nx*ny),conf=new Float64Array(nx*ny);
 let noSupport=0,oneLevel=0;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const x=bbox.x0+(i+0.5)*CELL,y=bbox.y0+(j+0.5)*CELL;
  let r=NEAR_RADIUS0,lv=null;
  // expand until two distinct levels support the cell (bracket) or the cap is hit
  for(let tries=0;tries<7&&r<=NEAR_RADIUS_MAX;tries++,r*=1.8){
   const near=index.near(x,y,r),best=new Map();
   for(const e of near){
    const k=Math.round(e.z*100);
    if(!best.has(k)||best.get(k).d>e.d)best.set(k,{z:e.z,d:e.d});}
   const arr=[...best.values()].sort((a,b)=>a.d-b.d);
   if(arr.length>=2){lv=arr;break;}
   if(arr.length===1)lv=arr;}
  const o=i+j*nx;
  if(!lv){z[o]=NaN;conf[o]=0;noSupport++;continue;}
  const z1=lv[0].z,d1=lv[0].d;
  let other=null;for(let k=1;k<lv.length;k++)if(Math.abs(lv[k].z-z1)>0.01){other=lv[k];break;}
  if(!other){ // single level: flat shelf assumption, lower confidence
   z[o]=z1;conf[o]=Math.max(0,0.6*(1-(d1-4)/40));oneLevel++;continue;}
  const d2=other.d;
  z[o]=z1+(other.z-z1)*(d1/(d1+d2));
  const dm=Math.max(d1,d2);
  conf[o]=dm<=8?1:Math.max(0,1-(dm-8)/40);}
 return {z,conf,nx,ny,stats:{noSupport,oneLevel,contradictions,samples:samples.length}};}

/* ---------- trend-preserving masked Gaussian ---------- */
function fitPlane(z,conf,nx,ny){
 let sw=0,sx=0,sy=0,sz=0,sxx=0,sxy=0,syy=0,sxz=0,syz=0;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const w=conf[i+j*nx];if(!(w>0)||!Number.isFinite(z[i+j*nx]))continue;
  const x=(i+0.5)*CELL,y=(j+0.5)*CELL,v=z[i+j*nx];
  sw+=w;sx+=w*x;sy+=w*y;sz+=w*v;sxx+=w*x*x;sxy+=w*x*y;syy+=w*y*y;sxz+=w*x*v;syz+=w*y*v;}
 // normal equations [[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,sw]]·[a,b,c]=[sxz,syz,sz]
 const m=[[sxx,sxy,sx,sxz],[sxy,syy,sy,syz],[sx,sy,sw,sz]];
 for(let c=0;c<3;c++){
  let p=c;for(let r=c+1;r<3;r++)if(Math.abs(m[r][c])>Math.abs(m[p][c]))p=r;
  if(Math.abs(m[p][c])<1e-12)return null;      // degenerate (all data on a line)
  [m[c],m[p]]=[m[p],m[c]];
  for(let r=0;r<3;r++){if(r===c)continue;const f=m[r][c]/m[c][c];
   for(let k=c;k<4;k++)m[r][k]-=f*m[c][k];}}
 const a=m[0][3]/m[0][0],b=m[1][3]/m[1][1],c=m[2][3]/m[2][2];
 return p=>p?a*p[0]+b*p[1]+c:[a,b,c];}

function gaussianField(r,conf,nx,ny,sigmaCells){
 const rad=Math.max(1,Math.ceil(4*sigmaCells));
 const k=new Float64Array(2*rad+1);let ksum=0;
 for(let i=-rad;i<=rad;i++){const v=Math.exp(-0.5*(i/sigmaCells)*(i/sigmaCells));k[i+rad]=v;ksum+=v;}
 const w=nx,h=ny;
 const tmp=new Float64Array(w*h),denT=new Float64Array(w*h);
 const out=new Float64Array(w*h),den=new Float64Array(w*h);
 const applyPass=(src,srcDen,dst,dstDen,horiz)=>{
  for(let jj=0;jj<h;jj++)for(let ii=0;ii<w;ii++){
   let num=0,dsum=0;
   for(let t=-rad;t<=rad;t++){
    let si=ii,sj=jj;
    if(horiz)si+=t;else sj+=t;
    if(si<0||sj<0||si>=w||sj>=h)continue;
    const o=si+sj*w,wt=k[t+rad],c=srcDen[o];
    if(c>0){num+=wt*src[o]*c;dsum+=wt*c;}}
   const o=ii+jj*w;dst[o]=num;dstDen[o]=dsum;}};
 // horizontal then vertical, carrying numerator and denominator separately
 let sN=r,sD=conf;applyPass(sN,sD,tmp,denT,true);
 applyPass(tmp,denT,out,den,false);
 const res=new Float64Array(w*h),resConf=new Float64Array(w*h);
 const full=ksum*ksum;
 for(let o=0;o<w*h;o++){
  const d=den[o];
  if(d>1e-9){res[o]=out[o]/d;resConf[o]=Math.min(1,d/full*2);} // <50% kernel support => conf<1
  else{res[o]=NaN;resConf[o]=0;}}
 return {r:res,conf:resConf};}

/* ---------- marching squares at the accepted levels ---------- */
function contourAtLevel(F,level,bbox){
 const {z,conf,nx,ny}=F,segs=[];
 const gv=(i,j)=>z[i+j*nx];
 for(let j=-1;j<ny;j++)for(let i=-1;i<nx;i++){
  const c00=(i<0||j<0)?NaN:gv(i,j),      c10=(i+1>=nx||j<0)?NaN:gv(i+1,j),
        c11=(i+1>=nx||j+1>=ny)?NaN:gv(i+1,j+1),c01=(i<0||j+1>=ny)?NaN:gv(i,j+1);
  if(![c00,c10,c11,c01].every(Number.isFinite))continue;
  let idx=0;
  if(c00>level)idx|=1; if(c10>level)idx|=2; if(c11>level)idx|=4; if(c01>level)idx|=8;
  if(idx===0||idx===15)continue;
  const x0=bbox.x0+i*CELL,y0=bbox.y0+j*CELL;
  const e={};
  const interp=(a,b,pa,pb)=>{const t=(level-a)/(b-a);return [pa[0]+(pb[0]-pa[0])*t,pa[1]+(pb[1]-pa[1])*t];};
  const P00=[x0,y0],P10=[x0+CELL,y0],P11=[x0+CELL,y0+CELL],P01=[x0,y0+CELL];
  const bitSet=m=>m!==0;
  if(bitSet(idx&1)!==bitSet(idx&2))e.b=interp(c00,c10,P00,P10);   // bottom: c00/c10 differ
  if(bitSet(idx&2)!==bitSet(idx&4))e.r=interp(c10,c11,P10,P11);   // right: c10/c11 differ
  if(bitSet(idx&4)!==bitSet(idx&8))e.t=interp(c01,c11,P01,P11);   // top: c01/c11 differ
  if(bitSet(idx&8)!==bitSet(idx&1))e.l=interp(c00,c01,P00,P01);   // left: c00/c01 differ
  const push=(a,b)=>segs.push([a,b]);
  // saddle (5,10): resolve by the cell-centre average — deterministic, no crossing
  const centre=(c00+c10+c11+c01)/4;
  if(idx===5){if(centre>level){push(e.l,e.t);push(e.b,e.r);}else{push(e.l,e.b);push(e.t,e.r);}}
  else if(idx===10){if(centre>level){push(e.l,e.b);push(e.t,e.r);}else{push(e.l,e.t);push(e.b,e.r);}}
  else{
   /* corners: 1=c00, 2=c10, 4=c11, 8=c01 (above level). Edges: bottom c00|c10,
      right c10|c11, top c01|c11, left c00|c01 — each crossed iff its two corners differ. */
   const table={1:['l','b'],2:['b','r'],3:['l','r'],4:['r','t'],6:['b','t'],
    7:['l','t'],8:['t','l'],9:['b','t'],11:['t','r'],12:['l','r'],
    13:['b','r'],14:['l','b']};
   const pair=table[idx];if(pair)push(e[pair[0]],e[pair[1]]);}
  void conf;}
 return segs;}

function chainSegments(segs){
 const Q=p=>Math.round(p[0]*100)+','+Math.round(p[1]*100);
 const endMap=new Map();
 segs.forEach((s,i)=>{
  for(const p of s){const k=Q(p);if(!endMap.has(k))endMap.set(k,[]);endMap.get(k).push(i);}});
 const used=new Array(segs.length).fill(false),polys=[];
 for(let i=0;i<segs.length;i++){
  if(used[i])continue;
  used[i]=true;
  let poly=[segs[i][0],segs[i][1]];
  // extend both ends
  for(let end=0;end<2;end++){
   for(;;){
    const tip=end?poly[poly.length-1]:poly[0],k=Q(tip);
    const cand=(endMap.get(k)||[]).find(si=>!used[si]);
    if(cand===undefined)break;
    used[cand]=true;
    const [a,b]=segs[cand],ka=Q(a),kb=Q(b);
    let nxt=null;
    if(ka===k&&kb!==Q(tip))nxt=b;else if(kb===k&&ka!==Q(tip))nxt=a;
    else nxt=(ka===k)?b:a;   // degenerate zero-length: step over
    if(end)poly.push(nxt);else poly.unshift(nxt);}}
  if(poly.length>=3)polys.push(poly);}
 return polys;}

function douglasPeucker(pts,tol){
 if(pts.length<3)return pts.map(p=>p.slice());
 const keep=new Array(pts.length).fill(false);keep[0]=keep[pts.length-1]=true;
 const stack=[[0,pts.length-1]];
 while(stack.length){
  const [a,b]=stack.pop();
  const ax=pts[a][0],ay=pts[a][1],bx=pts[b][0],by=pts[b][1];
  const dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy;
  let worst=-1,wi=-1;
  for(let i=a+1;i<b;i++){
   const px=pts[i][0]-ax,py=pts[i][1]-ay;
   let t=len2>0?(px*dx+py*dy)/len2:0;t=Math.max(0,Math.min(1,t));
   const d=Math.hypot(px-t*dx,py-t*dy);
   if(d>worst){worst=d;wi=i;}}
  if(worst>tol){keep[wi]=true;stack.push([a,wi],[wi,b]);}}
 return pts.filter((p,i)=>keep[i]).map(p=>p.slice());}

function chaikinOpen(points,rounds){
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

/* Contour-extraction postprocess: grid isolines carry stair wobble at cell corners even
   when the FIELD is smooth. Douglas-Peucker at a generous tolerance plus two Chaikin
   rounds remove that extraction artifact (the physical smoothing happened in the field;
   this only stops the raster from re-adding corners). The same polylines feed display AND
   the row-guide geometry, so both see identical shapes. */
const EXTRACT_TOL=0.5, EXTRACT_SMOOTH_ROUNDS=2;
function cleanPolyline(pts){
 return chaikinOpen(douglasPeucker(pts,EXTRACT_TOL),EXTRACT_SMOOTH_ROUNDS);}

/* ---------- public API ---------- */
function guidance(contours,level,opts){
 const lvl=Math.max(0,Math.min(6,Math.round(level||0)));
 const src=(contours||[]).filter(c=>Array.isArray(c.points)||Array.isArray(c.controls));
 if(!src.length)throw new Error('smoothing: no contour lines');
 const t0=Date.now();
 if(lvl===0){
  // deep copies exactly — no raster round trip (spec 3C)
  return {contours:src.map(c=>({...c,points:(c.points||c.controls).map(p=>p.slice())})),
   meta:{level:0,sigma:0,runtimeMs:Date.now()-t0,levelsMissing:[],recon:null,note:'accepted source, unsmoothed'}};
 }
 const cell=(opts&&opts.cell)||CELL;
 const sigma=SIGMAS[lvl];
 // bbox over contours (+boundary when given) padded so strong sigmas have support at the edge
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const c of src)for(const p of (c.points||c.controls)){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
 if(opts&&opts.boundary)for(const p of opts.boundary){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
 const pad=(opts&&opts.pad)!==undefined?opts.pad:EDGE_PAD;
 x0-=pad;y0-=pad;x1+=pad;y1+=pad;
 const nx=Math.ceil((x1-x0)/cell)+1,ny=Math.ceil((y1-y0)/cell)+1;
 const bbox={x0,y0,nx,ny,cell};
 const F0=buildZ0(src,bbox);
 void cell;
 // baseline reconstruction error at source vertices (every 5th): guidance vs accepted labels
 let reconRms=0,reconMax=0,reconN=0;
 {
  const idx=sampleIndex((()=>{const s=[];for(const c of src)for(const p of (c.points||c.controls))s.push([p[0],p[1],c.z]);return s;})());
  // direct nearest-level read at vertices (not the grid) would trivially be 0; instead
  // sample the built z0 grid bilinearly at each 5th vertex
  const zb=(x,y)=>{
   const fx=(x-bbox.x0)/cell-0.5,fy=(y-bbox.y0)/cell-0.5;
   const i=Math.floor(fx),j=Math.floor(fy);
   if(i<0||j<0||i+1>=nx||j+1>=ny)return null;
   const tx=fx-i,ty=fy-j,z=F0.z;
   const a=z[i+j*nx],b=z[i+1+j*nx],c2=z[i+(j+1)*nx],d=z[i+1+(j+1)*nx];
   if(!Number.isFinite(a)||!Number.isFinite(b)||!Number.isFinite(c2)||!Number.isFinite(d))return null;
   return a*(1-tx)*(1-ty)+b*tx*(1-ty)+c2*(1-tx)*ty+d*tx*ty;};
  for(let ci=0;ci<src.length;ci++)for(let pi=0;pi<src[ci].points.length;pi+=5){
   const p=src[ci].points[pi],v=zb(p[0],p[1]);
   if(v===null)continue;
   const e=Math.abs(v-src[ci].z);reconRms+=e*e;reconMax=Math.max(reconMax,e);reconN++;}
  reconRms=reconN?Math.sqrt(reconRms/reconN):null;}
 // trend-preserving smoothing: plane of z0 + Gaussian of residual, mask-aware
 const plane=fitPlane(F0.z,F0.conf,nx,ny);
 const r=new Float64Array(nx*ny);
 for(let o=0;o<nx*ny;o++){
  if(!(F0.conf[o]>0)||!Number.isFinite(F0.z[o])){r[o]=NaN;continue;}
  const x=(o%nx+0.5)*cell,y=(Math.floor(o/nx)+0.5)*cell;
  r[o]=F0.z[o]-plane([x,y]);}
 const G=gaussianField(r,F0.conf,nx,ny,sigma/cell);
 const zG=new Float64Array(nx*ny);let lowConf=0;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const o=i+j*nx;
  if(!(G.conf[o]>0)||!Number.isFinite(G.r[o])){zG[o]=F0.z[o];continue;}  // no support: keep z0 read
  zG[o]=plane([ (i+0.5)*cell,(j+0.5)*cell ])+G.r[o];
  if(G.conf[o]<0.5)lowConf++;}
 const F={z:zG,conf:G.conf,nx,ny};
 // extract at the accepted levels
 const levels=[...new Set(src.map(c=>c.z))].sort((a,b)=>a-b);
 const outContours=[],levelsMissing=[],components={};
 for(const L of levels){
  const segs=contourAtLevel(F,L,bbox);
  const polys=chainSegments(segs).map(p=>cleanPolyline(p)).filter(p=>p.length>=3);
  let pts=0;for(const p of polys)pts+=p.length;
  if(!pts)levelsMissing.push(L);
  components[L]={in:src.filter(c=>c.z===L).length,out:polys.length};
  for(const p of polys)outContours.push({z:L,points:p});}
 const meta={level:lvl,sigma,cell,nx,ny,runtimeMs:Date.now()-t0,
  stats:F0.stats,lowConfCells:lowConf,levelsMissing,components,
  recon:{rms:reconRms,max:reconMax,n:reconN},
  note:'Smoothed placement guidance — reference terrain unchanged.'};
 // gradient of zGuide, cell-resolution central differences bilinear to the query point:
 // the same surface the contours come from (spec 3E)
 const grad=(x,y)=>{
  const fx=(x-bbox.x0)/cell-0.5,fy=(y-bbox.y0)/cell-0.5;
  const i=Math.floor(fx),j=Math.floor(fy);
  if(i<1||j<1||i+2>=nx||j+2>=ny)return {valid:false,conf:0};
  const z=F.z;
  const val=(ii,jj)=>z[ii+jj*nx];
  // bilinear weights inside cell (i,j)
  const tx=fx-i,ty=fy-j;
  const v=(ii,jj)=>{
   const a=val(ii,jj),b=val(ii+1,jj),c=val(ii,jj+1),d=val(ii+1,jj+1);
   if(![a,b,c,d].every(Number.isFinite))return null;
   return a*(1-tx)*(1-ty)+b*tx*(1-ty)+c*(1-tx)*ty+d*tx*ty;};
  // central differences: sample the field one cell left/right/up/down of the query point
  const xm=v(i-1,j),xp=v(i+1,j),ym=v(i,j-1),yp=v(i,j+1);
  const confHere=Math.min(
   G.conf[i+j*nx],G.conf[(i+1)+j*nx],G.conf[i+(j+1)*nx],G.conf[(i+1)+(j+1)*nx]);
  if(xm===null||xp===null||ym===null||yp===null)return {valid:false,conf:0};
  const gx=(xp-xm)/(2*cell),gy=(yp-ym)/(2*cell);
  const m=Math.hypot(gx,gy);
  if(m<1e-6)return {valid:true,dir:[0,0],conf:confHere,flat:true};   // near-flat: no direction
  return {valid:true,dir:[-gx/m,-gy/m],conf:confHere};};
 return {contours:outContours,meta,gradientAt:grad,field:F,bbox};}

/* Drop-in replacement for ParallelPara.smoothContours. */
function smoothContours(contours,level,opts){
 return guidance(contours,level,opts).contours;}

return {SIGMAS,CELL,guidance,smoothContours};
})();
if(typeof module!=='undefined')module.exports=Smoothing;
