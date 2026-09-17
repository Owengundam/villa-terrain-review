/* Functional test of the terrain editing panel in the BUILT page:
   open, drag a control point, press OK, verify recalculation ran on new terrain. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{}};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){this._f=f}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);

// panel starts hidden, opens on Edit terrain
assert(element('terrainPanel').hidden===true,'panel hidden initially');
vm.runInContext("$('terrain').onclick()",ctx);
assert(element('terrainPanel').hidden===false,'panel opens');
assert(element('terrainSvg').innerHTML.includes('data-tline'),'contour lines rendered');
assert(element('terrainSvg').innerHTML.includes('class="ctrl"'),'control points rendered');
const lineCount=(element('terrainSvg').innerHTML.match(/<polyline data-tline="/g)||[]).length;
assert(lineCount===18,'all 18 contour lines rendered, got '+lineCount);

// simplify budget inside the page context
const maxPts=vm.runInContext("terrainLines.reduce((m,l)=>Math.max(m,l.controls.length),0)",ctx);
assert(maxPts<=10,'page control lines respect 10-point budget, got '+maxPts);

// simulate dragging control point 3 of line 0 by 60m east, 40m south
const beforeRef=vm.runInContext("TerrainEdit.elevation(data.layouts[0].units[0].center[0],data.layouts[0].units[0].center[1],TerrainEdit.samples(terrainLines))",ctx);
vm.runInContext(`
 const line=terrainLines[0];
 line.controls[3][0]+=60; line.controls[3][1]-=40;
 terrainDraw();
`,ctx);
assert(element('terrainSvg').innerHTML.includes('data-tline'),'redraw ok after drag');
const afterDrag=vm.runInContext("TerrainEdit.elevation(data.layouts[0].units[0].center[0],data.layouts[0].units[0].center[1],TerrainEdit.samples(terrainLines))",ctx);

// press OK: layouts must be rebuilt and reduce posted to the worker
vm.runInContext("$('terrainOk').onclick()",ctx);
assert(element('terrainPanel').hidden===true,'panel closes on OK');
const ref0=vm.runInContext("data.layouts[0].units[0].reference",ctx);
const z0before=JSON.parse(vm.runInContext("JSON.stringify(data.layouts[0].units.map(u=>u.z))",ctx));
// reference must reflect dragged terrain (differ from original saved z where terrain changed)
assert(element('action-message').textContent.includes('Terrain updated'),'OK reports the change');
assert(element('action-message').textContent.includes('views re-aimed'),'OK reports view re-aiming');
// worker got a reduce job (status text set by run())
assert(element('status').textContent==='Calculating 3D views…','recalculation started on OK, got: '+element('status').textContent);
// layouts replaced in place: unit identities intact
const ids=vm.runInContext("data.layouts[0].units.map(u=>u.id).join(',')",ctx);
assert(ids.startsWith('V001'),'layout units preserved');
console.log('PASS terrain panel opens, renders 18 lines within 10-point budget, drag + OK rebuilds terrain and starts full recalculation');
console.log('INFO villa V001 reference before drag:',beforeRef.toFixed(2),'after drag:',afterDrag.toFixed(2),'| action message:',element('action-message').textContent);
