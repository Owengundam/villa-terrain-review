/* Regression: Planar fitting must never reverse a villa the contour LABELS call
   downhill, and must flip every villa the labels call clearly uphill.
   The reference read is independent of TerrainEdit: for each villa, sample the nearest
   contour's own z label 5..45 m ahead of and behind the arrow; the vote is the sum of
   the signs. vote >= +2 -> definitely uphill (must be flipped), vote <= -2 -> definitely
   downhill (must NOT be flipped), |vote| <= 1 -> ambiguous (not asserted).
   Pins the reported bug: staggered-2 V073/V078 were reversed by an earlier rule while
   V043/V068 were correctly flipped. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,oninput:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{},disabled:false};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);
const run=s=>vm.runInContext(s,ctx);

/* Independent label read: [[layoutIndex,id,vote,active], ...] */
const READ=`(()=>{
 const seg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));};
 const label=p=>{let best=Infinity,z=null;for(const c of data.contours)for(let k=0;k+1<c.points.length;k++){const d=seg(p,c.points[k],c.points[k+1]);if(d<best){best=d;z=c.z;}}return z;};
 const out=[];
 data.layouts.forEach((l,li)=>l.units.forEach(u=>{
  let v=0;
  for(const d of [5,10,15,20,25,30,35,40,45]){
   const f=label([u.center[0]+u.view[0]*d,u.center[1]+u.view[1]*d]);
   const b=label([u.center[0]-u.view[0]*d,u.center[1]-u.view[1]*d]);
   if(f!==null&&b!==null)v+=Math.sign(f-b);}
  out.push([li,u.id,v,u.active!==false]);}));
 return JSON.stringify(out);})()`;
const read=()=>JSON.parse(run(READ));
const views=()=>JSON.parse(run("JSON.stringify(data.layouts.map(l=>l.units.map(u=>u.view)))"));

const t0=Date.now();
/* --- scenario 1: the reported flow — no terrain change, one Planar fitting per arrangement.
   Two arrangements are enough for the flow-level invariant (the fitting code is
   arrangement-agnostic) and each pass costs ~2 minutes: the free and parallel arrangements'
   flip decisions are covered cheaply by `node phase0/orientation_report.js`. */
const names=JSON.parse(run("JSON.stringify(data.layouts.map(l=>l.name))"));
let flips=0,violations=[],missed=[];
const pinned={};
for(const idx of [2,3]){
  const tLayout=Date.now();
  run(`index=${idx};$('layout').value=String(${idx});reset();$('perpTol').value='15';`);
  const before=views(),voteBefore=new Map(read().filter(r=>r[0]===idx).map(r=>[r[1],r[2]]));
  run("$('startFitting').onclick()");
  const after=views();
  const now=read().filter(r=>r[0]===idx);
  const voteAfter=new Map(now.map(r=>[r[1],r[2]]));
  let rotated=0;
  before[idx].forEach((v,i)=>{
    const id=run(`data.layouts[${idx}].units[${i}].id`);
    const turned=Math.hypot(v[0]-after[idx][i][0],v[1]-after[idx][i][1])>1e-9;
    if(turned)rotated++;
    const b=voteBefore.get(id),a=voteAfter.get(id);
    if(idx===2&&['V043','V068','V073','V078'].includes(id))pinned[id]={before:b,after:a};
    // a reversal is the reported bug class: it read downhill and now reads uphill, whatever
    // combination of flip and rotation produced it
    if(b<=-2&&a>=2)violations.push(`${names[idx]}/${id} (${b} -> ${a})`);
  });
  // every definitely-uphill villa of THIS arrangement must end up facing downhill
  for(const [li,id,vote] of now)
    if(vote>=2&&run(`data.layouts[${idx}].units.find(u=>u.id==='${id}').active!==false`))missed.push(`${names[idx]}/${id} (${vote})`);
  flips+=rotated;
  console.log(`INFO ${names[idx]}: re-aimed ${rotated} villa(s), definitely-uphill remaining ${now.filter(r=>r[2]>=2&&r[3]).length} (${((Date.now()-tLayout)/1000).toFixed(0)}s)`);
}
console.log(`INFO no-terrain-change flow: ${flips} villa(s) re-aimed across the arrangements run here in ${((Date.now()-t0)/1000).toFixed(0)}s`);
// the reported case, stated as reads: V043/V068 shipped pointing uphill and had to end
// downhill; V073/V078 shipped fine and had to stay that way
assert(pinned.V043&&pinned.V043.before>=2&&pinned.V043.after<=1,'V043 must be corrected: '+JSON.stringify(pinned.V043));
assert(pinned.V068&&pinned.V068.before>=2&&pinned.V068.after<=1,'V068 must be corrected: '+JSON.stringify(pinned.V068));
assert(pinned.V073&&pinned.V073.before<=1&&pinned.V073.after<=1,'V073 shipped fine and must not be reversed: '+JSON.stringify(pinned.V073));
assert(pinned.V078&&pinned.V078.before<=1&&pinned.V078.after<=1,'V078 shipped fine and must not be reversed: '+JSON.stringify(pinned.V078));
console.log('PASS pinned case: staggered-2 V073/V078 still read downhill (votes '+pinned.V073.after+'/'+pinned.V078.after+'); V043/V068 corrected ('+pinned.V043.before+'->'+pinned.V043.after+', '+pinned.V068.before+'->'+pinned.V068.after+')');
assert.equal(violations.length,0,'no villa the labels call downhill may be reversed, and no flipped villa may still read uphill: '+violations.join(', '));
console.log('PASS no downhill-reading villa was reversed; every flip lands the arrow downhill');
assert.equal(missed.length,0,'every definitely-uphill villa must end facing downhill: '+missed.join(', '));
console.log('PASS every definitely-uphill villa ends facing downhill');

/* --- scenario 2: aggressive terrain edits, then fitting twice (full user flow) */
const t1=Date.now();
run("index=0;$('layout').value='0';reset();");
run("$('terrain').onclick()");
run("terrainLines[8].controls[4][0]+=150; terrainLines[8].controls[4][1]+=150; terrainLines[10].controls[3][0]-=140; terrainLines[10].controls[3][1]-=130;");
run("$('terrainOk').onclick()");
run("$('startFitting').onclick()");
run("$('terrain').onclick()");
run("terrainLines[3].controls[2][0]-=120; terrainLines[3].controls[2][1]+=90; terrainLines[5].controls[8][1]-=100;");
run("$('terrainOk').onclick()");
run("$('startFitting').onclick()");
const afterEdit=read();
const stillUp=afterEdit.filter(r=>r[2]>=2&&r[3]);
console.log(`INFO after aggressive double edit + fitting (${((Date.now()-t1)/1000).toFixed(0)}s): active villas still reading definitely uphill: ${stillUp.length}${stillUp.length?': '+stillUp.map(r=>r[0]+'/'+r[1]+'('+r[2]+')').join(' '):''}`);
assert.equal(stillUp.length,0,'after fitting, no active villa may read definitely uphill');
const g=run("JSON.stringify(TerrainEdit.geomCheck({units:data.layouts[0].units},data.boundary,data.layouts[0].units.map(u=>u.active!==false),3).issues)");
assert.equal(JSON.parse(g).length,0,'active villas stay geometrically legal: '+g);
console.log('PASS edited-terrain flow: no uphill reads, active geometry legal');
