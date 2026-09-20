/* Fit-stage separation tests: terrain OK = save+close only; Planar fitting = reorient+
   move+ghost (no worker); 3D view fitting = the worker stage (renamed button).
   Uphill is judged with an INDEPENDENT read (the contour labels the user compares
   against), never with TerrainEdit's own helper — a test that reuses the implementation's
   criterion cannot catch a wrong criterion.
   Runs on staggered-2: it ships villas whose arrows read definitely uphill, so the
   reorientation path is actually exercised. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script); // whole-page syntax check
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{}};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);
const run=s=>vm.runInContext(s,ctx);
const noWorker=()=>assert(element('status').textContent!=='Calculating 3D views…','no worker launch');

/* Independent label read for the current arrangement: [[id,vote,active], ...] */
const READ=`(()=>{
 const seg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));};
 const label=p=>{let best=Infinity,z=null;for(const c of data.contours)for(let k=0;k+1<c.points.length;k++){const d=seg(p,c.points[k],c.points[k+1]);if(d<best){best=d;z=c.z;}}return z;};
 return JSON.stringify(data.layouts[index].units.map(u=>{let v=0;
  for(const d of [5,10,15,20,25,30,35,40,45]){const f=label([u.center[0]+u.view[0]*d,u.center[1]+u.view[1]*d]),b=label([u.center[0]-u.view[0]*d,u.center[1]-u.view[1]*d]);if(f!==null&&b!==null)v+=Math.sign(f-b);}
  return [u.id,v,u.active!==false];}));})()`;
const readUp=()=>JSON.parse(run(READ)).filter(r=>r[2]);
const viewsNow=()=>JSON.parse(run("JSON.stringify(data.layouts[index].units.map(u=>u.view))"));

run("index=2;$('layout').value='2';reset();");

// 1. Terrain OK: saves contours + closes + landmass readout; no rotation, no recalc
const viewsBefore=viewsNow();
run("$('terrain').onclick()");
run("terrainLines[0].controls[3][0]+=60; terrainLines[0].controls[3][1]-=40;");
run("$('terrainOk').onclick()");
assert(element('terrainPanel').hidden===true,'panel closed');
assert(element('landmass').textContent.includes('Landmass change')&&element('landmass').textContent.includes('saved'),'landmass total + saved');
assert.equal(element('action-message').textContent,'Terrain saved.','OK reports save only');
assert.equal(JSON.stringify(viewsNow()),JSON.stringify(viewsBefore),'OK does not rotate or recalculate anything');
assert.equal(run("JSON.stringify(data.layouts[2].units.map(u=>u.z))"),run("JSON.stringify(data0.layouts[2].units.map(u=>u.z))"),'pads untouched by terrain save');
noWorker();
console.log('PASS terrain OK: save + close + landmass only — no rotation, no recalc');

// 2. Planar fitting: every villa the labels read definitely uphill is flipped to face
//    downhill; moves repair conflicts; unresolvable villas are ghosted; no worker.
const upBefore=readUp().filter(r=>r[1]>=2).map(r=>r[0]);
assert(upBefore.length>0,'scenario must contain uphill arrows to reorient (found '+upBefore.length+')');
run("$('startFitting').onclick()");
const viewsAfter=viewsNow();
assert(JSON.stringify(viewsAfter)!==JSON.stringify(viewsBefore),'planar fitting reoriented the uphill villas');
const flipped=new Set();
viewsBefore.forEach((v,i)=>{if(Math.hypot(v[0]+viewsAfter[i][0],v[1]+viewsAfter[i][1])<1e-9)flipped.add(run(`data.layouts[index].units[${i}].id`));});
const missed=upBefore.filter(id=>!flipped.has(id));
assert.equal(missed.length,0,'every definitely-uphill villa must be flipped: '+missed.join(', '));
const stillUp=readUp().filter(r=>r[1]>=2).map(r=>r[0]);
assert.equal(stillUp.length,0,'no active villa may still read uphill after fitting: '+stillUp.join(', '));
assert(element('action-message').textContent.includes('Planar fitting'),'planar fitting reported');
assert(/reoriented \d+ uphill villa/.test(element('action-message').textContent),'fitting reports the reorientation count');
noWorker();
const g=run("TerrainEdit.geomCheck({units:data.layouts[index].units},data.boundary,data.layouts[index].units.map(u=>u.active!==false),Number($('sideGap').value)||3)");
assert(g.ok,'post-fitting geometry legal for active villas');
console.log(`PASS planar fitting: ${upBefore.length} uphill arrow(s) [${upBefore.join(' ')}] flipped, 0 uphill left, geometry legal, no view recalc`);

// 3. 3D view fitting naming
assert(html.includes('>3D view fitting<'),'recalculate button renamed to 3D view fitting');
assert(html.includes('>Planar fitting<'),'planar fitting button labelled');
assert(html.includes('>OK — save terrain<'),'terrain OK button states save-only semantics');
console.log('PASS naming: Planar fitting / 3D view fitting / OK — save terrain');
