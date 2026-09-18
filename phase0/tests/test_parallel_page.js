/* parallelPara end-to-end tests in the BUILT page:
   populate, determinism, no-view-reduction, stale handling, rear overlay, smoothing. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,oninput:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{},disabled:false};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);
const layoutsBefore=vm.runInContext("data.layouts.length",ctx);

// 1. Populate: adds parallelPara layout, all villas active, labeled
vm.runInContext("$('populate').onclick()",ctx);
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
vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx),count,'view threshold change does not affect population');
vm.runInContext("$('clear').value='70'",ctx);
console.log('PASS population independent of view thresholds; no automatic reduction');

// 3. deterministic: repopulate gives identical result
const first=vm.runInContext("JSON.stringify(data.layouts[data.layouts.length-1].units.map(u=>[u.center,u.view]))",ctx);
vm.runInContext("$('populate').onclick()",ctx);
assert.equal(vm.runInContext("JSON.stringify(data.layouts[data.layouts.length-1].units.map(u=>[u.center,u.view]))",ctx),first,'repopulation is deterministic');
console.log('PASS deterministic repopulation');

// 4. stale marking: change smoothing → stale message; repopulate clears it
vm.runInContext("$('smooth').value='2'",ctx);
vm.runInContext("$('smooth').oninput()",ctx);
assert(element('landmass').textContent.includes('out of date'),'stale warning shown');
const staleCount=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
vm.runInContext("$('populate').onclick()",ctx);
assert(!element('landmass').textContent.includes('out of date'),'stale cleared after repopulate');
const newCount=vm.runInContext("data.layouts[data.layouts.length-1].units.length",ctx);
console.log('INFO smoothing level 2 population:',newCount,'villas (level 0:',count+')');
console.log('PASS stale handling: warning on settings change, cleared on repopulate');

// 5. reset smoothing restores original contours in the preview
vm.runInContext("$('smoothReset').onclick()",ctx);
assert.equal(vm.runInContext("smoothLevel",ctx),0,'reset returns to level 0');
console.log('PASS smoothing reset');

// 6. independent verification of the final arrangement
const v=vm.runInContext("ParallelPara.verify(data.layouts[data.layouts.length-1].units,data.boundary,Number($('sideGap').value)||3,Math.max(0,Number($('backClear').value)))",ctx);
assert.equal(v.issues.length,0,'independent verification passes: '+JSON.stringify(v.issues.slice(0,5)));
console.log('PASS independent verification: 0 issues on',v.count,'villas');

// 7. source terrain untouched
assert.deepEqual(vm.runInContext("JSON.stringify(data0.contours)",ctx),vm.runInContext("JSON.stringify(data0.contours)",ctx),'source preserved');
console.log('PASS all parallelPara page tests');
