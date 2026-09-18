/* Fit-stage separation tests: terrain OK = save+close only; Planar fitting = reorient+
   move+ghost (no worker); 3D view fitting = the worker stage (renamed button). */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script); // whole-page syntax check
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{}};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);
const noWorker=()=>assert(element('status').textContent!=='Calculating 3D views…','no worker launch');

// 1. Terrain OK: saves contours + closes + landmass readout; no rotation, no recalc
const viewsBefore=vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.view))",ctx);
vm.runInContext("$('terrain').onclick()",ctx);
vm.runInContext("terrainLines[0].controls[3][0]+=60; terrainLines[0].controls[3][1]-=40;",ctx);
vm.runInContext("$('terrainOk').onclick()",ctx);
assert(element('terrainPanel').hidden===true,'panel closed');
assert(element('landmass').textContent.includes('Landmass change')&&element('landmass').textContent.includes('saved'),'landmass total + saved');
assert.equal(element('action-message').textContent,'Terrain saved.','OK reports save only');
assert.equal(vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.view))",ctx),viewsBefore,'OK does not rotate or recalculate anything');
assert.equal(vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.z))",ctx),vm.runInContext("JSON.stringify(data0.layouts[0].units.map(u=>u.z))",ctx),'pads untouched by terrain save');
noWorker();
console.log('PASS terrain OK: save + close + landmass only — no rotation, no recalc');

// 2. Planar fitting: reorients villas to saved terrain, moves to clear conflicts, ghosts
//    unresolvable ones; still no worker (that is 3D view fitting)
vm.runInContext("$('startFitting').onclick()",ctx);
const viewsAfter=vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.view))",ctx);
assert(viewsAfter!==viewsBefore,'planar fitting reoriented villas to the saved terrain');
assert(element('action-message').textContent.includes('Planar fitting'),'planar fitting reported');
noWorker();
const g=vm.runInContext("TerrainEdit.geomCheck({units:data.layouts[0].units},data.boundary,data.layouts[0].units.map(u=>u.active!==false),Number($('sideGap').value)||3)",ctx);
assert(g.ok,'post-fitting geometry legal for active villas');
console.log('PASS planar fitting: reorient + move + ghost, geometry legal, no view recalc');

// 3. 3D view fitting naming
assert(html.includes('>3D view fitting<'),'recalculate button renamed to 3D view fitting');
assert(html.includes('>Planar fitting<'),'planar fitting button labelled');
console.log('PASS naming: Planar fitting / 3D view fitting');
