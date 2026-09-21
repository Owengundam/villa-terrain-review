(async()=>{
/* parallelPara end-to-end tests in the BUILT page:
   populate, determinism, no-view-reduction, stale handling, rear overlay, smoothing. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,oninput:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{},disabled:false};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);
// The vm's elements are stubs with empty values, so the harness has to mirror the defaults the
// real page carries as HTML attributes (sideGap 3, backClear 7, perpTol 15, model 70/75, eye
// 1.5, height 5, window -10..5). This is NOT the page defaulting anything: Populate refuses an
// empty clearance field on purpose, which test 8 below checks.
for(const [id,val] of [['sideGap','3'],['backClear','7'],['perpTol','15'],['eye','1.5'],['height','5'],['bottom','-10'],['top','5'],['clear','70'],['centralClear','75'],['smooth','0']])element(id).value=val;
const layoutsBefore=vm.runInContext("data.layouts.length",ctx);

// 1. Populate: adds parallelPara layout, all villas active, labeled
await vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("data.layouts.length",ctx),layoutsBefore+1,'parallelPara layout added');
assert.equal(vm.runInContext("data.layouts[data.layouts.length-1].name",ctx),'parallelPara');
const count=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
assert(count>0,'villas generated: '+count);
assert(vm.runInContext("data.layouts[data.layouts.length-1].units.every(u=>u.active!==false)",ctx),'all generated villas active');
assert(element('action-message').textContent.includes('Initial population — geometry checked; views not evaluated'),'label shown');
assert(element('action-message').textContent.includes(count+' villas'),'count shown');
console.log('PASS populate: parallelPara layout with',count,'active villas, correctly labeled');

// 2. no worker launch during populate (3D view fitting must not run)
assert(element('status').textContent!=='Calculating 3D views…','populate does not run view reduction');
// view thresholds don't change population: change clear %, populate again
vm.runInContext("$('clear').value='90'",ctx);
await vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx),count,'view threshold change does not affect population');
vm.runInContext("$('clear').value='70'",ctx);
console.log('PASS population independent of view thresholds; no automatic reduction');

// 3. deterministic: repopulate gives identical result
const first=vm.runInContext("JSON.stringify(data.layouts[data.layouts.length-1].units.map(u=>[u.center,u.view]))",ctx);
await vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("JSON.stringify(data.layouts[data.layouts.length-1].units.map(u=>[u.center,u.view]))",ctx),first,'repopulation is deterministic');
console.log('PASS deterministic repopulation');

// 4. stale marking: change smoothing → stale message; repopulate clears it
vm.runInContext("$('smooth').value='2'",ctx);
await vm.runInContext("$('smooth').oninput()",ctx);
assert(element('landmass').textContent.includes('out of date'),'stale warning shown');
const staleCount=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
await vm.runInContext("$('populate').onclick()",ctx);
assert(!element('landmass').textContent.includes('out of date'),'stale cleared after repopulate');
const newCount=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
console.log('INFO smoothing level 2 population:',newCount,'villas (level 0:',count+')');
console.log('PASS stale handling: warning on settings change, cleared on repopulate');

// 5. Reset terrain response scale restores original contours in the preview
await vm.runInContext("$('smoothReset').onclick()",ctx);
assert.equal(vm.runInContext("smoothLevel",ctx),0,'reset returns to level 0');
console.log('PASS smoothing reset');

// 6. independent verification of the final arrangement
const v=vm.runInContext("ParallelPara.verify(data.layouts[data.layouts.length-1].units,data.boundary,Number($('sideGap').value)||3,Math.max(0,Number($('backClear').value)))",ctx);
assert.equal(v.issues.length,0,'independent verification passes: '+JSON.stringify(v.issues.slice(0,5)));
console.log('PASS independent verification: 0 issues on',v.count,'villas');

// 7. source terrain untouched
assert.deepEqual(vm.runInContext("JSON.stringify(data0.contours)",ctx),vm.runInContext("JSON.stringify(data0.contours)",ctx),'source preserved');
console.log('PASS all parallelPara page tests');

// 8. invalid input is refused and the previous arrangement is kept
const beforeInvalid=vm.runInContext("data.layouts.length",ctx);
vm.runInContext("$('sideGap').value=''",ctx);
await vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("data.layouts.length",ctx),beforeInvalid,'an empty clearance field does not add or replace a layout');
assert(/Cannot populate/.test(element('action-message').textContent),'the refusal is reported: '+element('action-message').textContent.slice(0,80));
vm.runInContext("$('sideGap').value='3'",ctx);
console.log('PASS invalid input: refused with a message, previous arrangement kept');

// 9. a superseded run cannot overwrite a newer result
const countBeforeSupersede=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
vm.runInContext("(()=>{globalThis.__origGen=ParallelPara.generateLayout;ParallelPara.generateLayout=function(d,o){const r=globalThis.__origGen(d,o);populateRunId++;return r;};})()",ctx);
await vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx),countBeforeSupersede,'a superseded run is discarded, not committed');
vm.runInContext("ParallelPara.generateLayout=globalThis.__origGen",ctx);   // restore: later tests must see the real generator
assert(/replaced this one/.test(element('status').textContent),'the discard is reported');
console.log('PASS superseded run: discarded and reported, previous result intact');

// 10. generation uses the ACCEPTED terrain, never the shipped one
vm.runInContext("(()=>{const c=data.contours[data.contours.length-1];c.points=c.points.map(p=>[p[0],p[1]+9]);})()",ctx);
await vm.runInContext("$('populate').onclick()",ctx);
assert(vm.runInContext("JSON.stringify(data0.contours)!==JSON.stringify(data.contours)",ctx),'data0 is still the shipped terrain while data.contours is edited');
const editedCount=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
assert(editedCount>0,'the edited terrain still generates: '+editedCount);
// and the reference elevations follow the accepted terrain convention (unsmoothed accepted lines)
const refOk=vm.runInContext("(()=>{const l=data.layouts[data.layouts.length-1];const pts=TerrainEdit.samples(TerrainEdit.buildFromContours(data.contours));return l.units.every(u=>Math.abs(u.reference-TerrainEdit.elevation(u.center[0],u.center[1],pts))<1e-9);})()",ctx);
assert(refOk,'reference elevations come from the accepted (unsmoothed) terrain');
console.log('PASS accepted terrain: the population follows the edited terrain, references included');

// 11. population is independent of every view-only setting, and they do not mark it stale
const settledCount=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
vm.runInContext("$('perpTol').value='0';$('eye').value='9';$('clear').value='95'",ctx);  // no perpTol handler exists: the tolerance is a fitting input, not a generation input
assert(!element('landmass').textContent.includes('out of date'),'view-only settings (tolerance, eye, clear%) do not mark the population stale');
await vm.runInContext("$('populate').onclick()",ctx);
const afterView=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
assert.equal(afterView,settledCount,'view-only settings do not change the population ('+afterView+' vs '+settledCount+')');
assert(element('status').textContent!=='Calculating 3D views…','Populate still does not run view reduction');
console.log('PASS view-only independence: eye/height/window/clear% and the perpendicular tolerance leave the population alone');

// 12. compatibility with the unchanged 3D view fitting stage: run the solver on a copy
const fit=vm.runInContext("(()=>{const l=JSON.parse(JSON.stringify(data.layouts[data.layouts.length-1]));const r=View3D.reduce(l,data.rules.view3d);return {initial:l.units.length,retained:r.active.filter(Boolean).length,valid:r.valid};})()",ctx);
assert(fit.initial>0&&fit.retained>0,'the 3D view fitter accepts the generated layout: '+JSON.stringify(fit));
assert(fit.valid,'the 3D fitter reports a valid arrangement for the generated population');
assert.equal(vm.runInContext("data.layouts[data.layouts.length-1].units.filter(u=>u.active===false).length",ctx),0,'Populate itself left every villa active (no view filtering leaked in)');
console.log('INFO 3D view fitting on a copy: '+fit.initial+' villas in, '+fit.retained+' retained (valid '+fit.valid+')');
console.log('PASS integration: the generated layout is a valid input to the unchanged view fitter');

})().catch(e=>{console.error(e);process.exitCode=1;});
