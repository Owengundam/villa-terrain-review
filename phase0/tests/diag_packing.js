/* Diagnostic: populate pipeline + pocket probes. Not a unit test. */
const fs=require('node:fs'),P=require('../parallel_para.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
const A={sideGap:3,backClear:7,perpTol:15};
const par=P.settings(A).values;
const boundary=report.boundary;

function minDistToGuides(x,y,guides){
 let best=Infinity;
 for(const g of guides||[]){
  if(!g.nodes)continue;
  for(const n of g.nodes)best=Math.min(best,Math.hypot(n.x-x,n.y-y));}
 return best;}

function isolatedFit(x,y,field,dropField){
 const face=field.facing(x,y);
 const info=field.zInfo?field.zInfo(x,y):null;
 if(!face)return {ok:false,reason:(info&&info.status)||'no-facing',terrain:info&&info.status};
 const poly=P.rect([x,y],face.downhill,11,23);
 if(!P.polyInsideBoundary(poly,boundary))return {ok:false,reason:'boundary',view:face.downhill,terrain:info&&info.status};
 const drop=P.groundDrop(dropField,[x,y],face.downhill,23,11);
 if(!drop.ok)return {ok:false,reason:'direction',view:face.downhill,terrain:info&&info.status};
 return {ok:true,reason:null,view:face.downhill,poly,terrain:info&&info.status};}

function neighborFit(x,y,view,units){
 const ctx={par,boundary,index:P.makeIndex(Math.max(par.alongPitch,par.acrossPitch))};
 for(const u of units)ctx.index.add(u);
 const bad=P.checkCandidate([x,y],view,ctx);
 return bad?{ok:false,reason:bad.reason}:{ok:true,reason:null};}

console.log('--- smooth sweep ---');
for(const lvl of [0,1,2,3,4,6,8,10]){
 const sm=P.smoothContours(report.contours,lvl);
 const t=Date.now();
 const res=P.generateLayout(report,{smoothed:sm,terrainLines:report.contours,...A});
 const zero=(res.rows||[]).filter(r=>!(r.units&&r.units.length)).map(r=>r.id+'@'+r.length.toFixed(0));
 console.log(JSON.stringify({lvl,ok:res.ok,n:res.units.length,guides:res.guides&&res.guides.count,
  delta:res.guides&&res.guides.delta,zero,ms:Date.now()-t,used:res.metrics&&res.metrics.rows.used}));}

const sm=P.smoothContours(report.contours,2);
const field=P.buildField(sm,par),dropField=P.buildField(report.contours,par);
const res=P.generateLayout(report,{smoothed:sm,terrainLines:report.contours,...A});
const fams=P.buildGuideFamilies(field,boundary,par,sm);
const win=fams.find(f=>Math.abs(f.delta-(res.guides.delta||0))<1e-6)||fams[0];
console.log('\n--- winning family ---');
console.log(JSON.stringify({delta:res.guides.delta,families:fams.length,n:res.units.length,
 recovery:res.recovery&&res.recovery.byClass,rejects:res.rejects&&res.rejects.byReason,
 pruned:res.pruned,budget:res.budget&&{variants:res.budget.variants,attempts:res.budget.attempts}}));

console.log('\n--- pipeline per guide ---');
for(const g of win.guides){
 const lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
 const usable=(g.usable||[]).reduce((s,iv)=>s+(iv.hi-iv.lo),0);
 const ivs=g.usable||[{lo,hi}];
 const sampled=[],accepted=[];
 const placed=(res.rows.find(r=>r.id===g.id)||{}).units||[];
 for(const iv of ivs){
  for(let s=iv.lo;s<=iv.hi+1e-9;s+=par.alongPitch)sampled.push(Number(s.toFixed(1)));}
 console.log(JSON.stringify({id:g.id,len:Number(g.length.toFixed(1)),usable:Number(usable.toFixed(1)),
  intervals:(g.usable||[]).map(iv=>({lo:+iv.lo.toFixed(1),hi:+iv.hi.toFixed(1)})),
  sampled:sampled.length,placed:placed.length,
  mid:[+g.nodes[Math.floor(g.nodes.length/2)].x.toFixed(1),+g.nodes[Math.floor(g.nodes.length/2)].y.toFixed(1)]}));}

console.log('\n--- empty-guide station audit (zero villa rows) ---');
for(const g of win.guides){
 const placed=(res.rows.find(r=>r.id===g.id)||{}).units||[];
 if(placed.length)continue;
 const ctx={units:[],index:P.makeIndex(Math.max(par.alongPitch,par.acrossPitch)),
  rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField,maxUnits:300};
 const reasons={};
 const lo=g.nodes[0].s,hi=g.nodes[g.nodes.length-1].s;
 for(let s=lo;s<=hi;s+=3){
  if(g.usable&&!P.inUsable(g.usable,s)){reasons.notUsable=(reasons.notUsable||0)+1;continue;}
  const r=P.attemptPlacement(g,s,ctx,[]);
  reasons[r.ok?'ok':r.reason]=(reasons[r.ok?'ok':r.reason]||0)+1;}
 console.log(JSON.stringify({id:g.id,len:+g.length.toFixed(1),usable:(g.usable||[]),reasons}));}

console.log('\n--- pocket probes (12 m grid, isolated vs vs-population) ---');
let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;
for(const p of boundary){bx0=Math.min(bx0,p[0]);by0=Math.min(by0,p[1]);bx1=Math.max(bx1,p[0]);by1=Math.max(by1,p[1]);}
const pockets={
 lowerInterior:{xmin:3180,xmax:3260,ymin:2085,ymax:2145},
 rightMiddle:{xmin:3260,xmax:3340,ymin:2140,ymax:2220}
};
for(const [name,box] of Object.entries(pockets)){
 const tally={n:0,isolatedOk:0,bothOk:0,byIso:{},byNbor:{}};
 const examples={bothOk:[],isoOnly:[],neither:[]};
 for(let x=box.xmin;x<=box.xmax;x+=12)for(let y=box.ymin;y<=box.ymax;y+=12){
  if(!P.pointInPoly([x,y],boundary))continue;
  tally.n++;
  const iso=isolatedFit(x,y,field,dropField);
  tally.byIso[iso.reason||'ok']=(tally.byIso[iso.reason||'ok']||0)+1;
  if(!iso.ok){
   if(examples.neither.length<3)examples.neither.push({x,y,iso:iso.reason,terrain:iso.terrain,dGuide:+minDistToGuides(x,y,win.guides).toFixed(1)});
   continue;}
  tally.isolatedOk++;
  const nbor=neighborFit(x,y,iso.view,res.units);
  tally.byNbor[nbor.reason||'ok']=(tally.byNbor[nbor.reason||'ok']||0)+1;
  if(nbor.ok){
   tally.bothOk++;
   if(examples.bothOk.length<5)examples.bothOk.push({x:+x.toFixed(1),y:+y.toFixed(1),dGuide:+minDistToGuides(x,y,win.guides).toFixed(1)});}
  else if(examples.isoOnly.length<5)examples.isoOnly.push({x:+x.toFixed(1),y:+y.toFixed(1),nbor:nbor.reason,dGuide:+minDistToGuides(x,y,win.guides).toFixed(1)});
 }
 console.log(JSON.stringify({name,tally,examples},null,0));}

console.log('\n--- 29.8 trim sensitivity (family row count / usable m) ---');
for(const sep of [29.8,24,20,15]){
 const rows=[];
 const spines=[];
 /* reuse winning family construction by loosening punch via a local copy: just report
    how many win.guides samples sit <sep from another guide. */
 let closeUsable=0,usableN=0;
 for(const g of win.guides)for(const iv of g.usable||[]){
  for(let s=iv.lo;s<=iv.hi;s+=3){
   const q=P.guidePointAt(g,s);if(!q)continue;
   usableN++;
   let best=Infinity;
   for(const h of win.guides){
    if(h===g)continue;
    for(const n of h.nodes)best=Math.min(best,Math.hypot(n.x-q.x,n.y-q.y));}
   if(best<sep)closeUsable++;}}
 console.log(JSON.stringify({sep,usableStations:usableN,thoseCloserThanSepToOtherGuide:closeUsable}));}
