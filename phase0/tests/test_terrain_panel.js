/* Terrain editing panel tests in the BUILT page (post stage-separation):
   OK = save terrain + close + landmass readout. Nothing else.
   Rotation/reorientation belongs to Planar fitting; view recalculation to 3D view fitting. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{}};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);

// panel starts hidden, opens on Edit terrain
assert(element('terrainPanel').hidden===true,'panel hidden initially');
vm.runInContext("$('terrain').onclick()",ctx);
assert(element('terrainPanel').hidden===false,'panel opens');
assert(element('terrainSvg').innerHTML.includes('<polyline data-tline="'),'contour lines rendered');
assert(element('terrainSvg').innerHTML.includes('class="ctrl"'),'control points rendered');
const lineCount=(element('terrainSvg').innerHTML.match(/<polyline data-tline="/g)||[]).length;
assert(lineCount===18,'all 18 contour lines rendered, got '+lineCount);
const maxPts=vm.runInContext("terrainLines.reduce((m,l)=>Math.max(m,l.controls.length),0)",ctx);
assert(maxPts<=10,'page control lines respect 10-point budget, got '+maxPts);
console.log('PASS panel opens, 18 lines rendered within 10-point budget');

// drag control point 3 of line 0, press OK
vm.runInContext("terrainLines[0].controls[3][0]+=60; terrainLines[0].controls[3][1]-=40; terrainDraw();",ctx);
const viewsBefore=vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.view))",ctx);
const zBefore=vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.z))",ctx);
vm.runInContext("$('terrainOk').onclick()",ctx);
assert(element('terrainPanel').hidden===true,'panel closes on OK');
assert.equal(element('action-message').textContent,'Terrain saved.','OK reports save only');
assert(element('landmass').textContent.includes('Landmass change')&&element('landmass').textContent.includes('saved'),'landmass total displayed');
assert.equal(vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.view))",ctx),viewsBefore,'OK does not rotate anything');
assert.equal(vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.z))",ctx),zBefore,'OK does not touch pads');
console.log('PASS OK: saves terrain, closes, shows landmass — no rotation, no pad change, no recalc');

// edited contours persist; panel reopens with the edited terrain
const contoursAfter=vm.runInContext("JSON.stringify(data.contours[0].points)",ctx);
vm.runInContext("terrainOpen()",ctx);
assert.equal(vm.runInContext("JSON.stringify(terrainLines[0].controls)",ctx),contoursAfter,'panel reopens with the edited terrain');
console.log('PASS OK persists edited control lines');

// Reset lines restores the ORIGINAL shipped contours even after OK
vm.runInContext("terrainReset()",ctx);
const originalControls=vm.runInContext("JSON.stringify(TerrainEdit.buildFromContours(terrainOriginal)[0].controls)",ctx);
assert.equal(vm.runInContext("JSON.stringify(terrainLines[0].controls)",ctx),originalControls,'Reset lines restores the original shipped terrain');
vm.runInContext("$('terrainOk').onclick()",ctx);
assert.equal(vm.runInContext("JSON.stringify(data.contours[0].points)",ctx),originalControls,'OK after Reset saves the original terrain');
console.log('PASS Reset lines restores original contours and OK saves them');

// Restore saved plan fully reverts contours
vm.runInContext("terrainOpen()",ctx);
vm.runInContext("terrainLines[1].controls[5][0]-=70; terrainLines[1].controls[5][1]+=35; terrainDraw();",ctx);
vm.runInContext("$('terrainOk').onclick()",ctx);
vm.runInContext("reset()",ctx);
assert.equal(vm.runInContext("JSON.stringify(data.contours)",ctx),vm.runInContext("JSON.stringify(data0.contours)",ctx),'Restore saved plan reverts contours');
console.log('PASS Restore saved plan reverts terrain to shipped contours');
console.log('INFO landmass readout:',element('landmass').textContent);
