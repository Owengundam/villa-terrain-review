/* Regression: after Planar fitting, NO villa's view may point uphill relative to the
   local terrain at its final centre (all layouts, full page flow). */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const nodes={};
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',onclick:null,onchange:null,querySelectorAll:()=>[],style:{},hidden:true,dataset:{}};}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,window:{addEventListener:()=>{},removeEventListener:()=>{}},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}},Blob:class{},Worker:class{postMessage(){}terminate(){}set onmessage(f){}set onerror(f){}}});
new vm.Script(script).runInContext(ctx);

function countUphill(){
 return vm.runInContext(`
  (()=>{const pts=TerrainEdit.samples(TerrainEdit.buildFromContours(data.contours));
   let up=0,upList=[];
   data.layouts.forEach((l,li)=>l.units.forEach((u,i)=>{
    const err=TerrainEdit.orientationError(u,pts);
    if(err>90){up++;upList.push(li+':'+u.id+' '+err.toFixed(0));}
   }));
   return up+'|'+upList.slice(0,5).join(',');})()`,ctx);}
function worstErr(){
 return vm.runInContext(`
  (()=>{const pts=TerrainEdit.samples(TerrainEdit.buildFromContours(data.contours));
   let w=0;
   data.layouts.forEach(l=>l.units.forEach(u=>{w=Math.max(w,TerrainEdit.orientationError(u,pts));}));
   return w.toFixed(1);})()`,ctx);}

// aggressive flow: big terrain edits, save, planar fitting, second edit, fitting again
vm.runInContext("$('terrain').onclick()",ctx);
vm.runInContext("terrainLines[8].controls[4][0]+=150; terrainLines[8].controls[4][1]+=150; terrainLines[10].controls[3][0]-=140; terrainLines[10].controls[3][1]-=130;",ctx);
vm.runInContext("$('terrainOk').onclick()",ctx);
vm.runInContext("$('startFitting').onclick()",ctx);
vm.runInContext("$('terrain').onclick()",ctx);
vm.runInContext("terrainLines[3].controls[2][0]-=120; terrainLines[3].controls[2][1]+=90; terrainLines[5].controls[8][1]-=100;",ctx);
vm.runInContext("$('terrainOk').onclick()",ctx);
vm.runInContext("$('startFitting').onclick()",ctx);
const [up,list]=countUphill().split('|');
const worst=Number(worstErr());
console.log('INFO uphill (>90° error):',up,' worst orientation error:',worst+'°');
assert.equal(up,'0','no villa may point uphill after planar fitting: '+list);
assert(worst<=90+2,'worst error within perpendicular half-range');
console.log('PASS no uphill views after planar fitting (aggressive double-edit flow)');
// and the arrangement is still geometrically legal for active villas
const g=vm.runInContext("TerrainEdit.geomCheck({units:data.layouts[0].units},data.boundary,data.layouts[0].units.map(u=>u.active!==false),3)",ctx);
assert(g.ok,'active villas remain legal after orientation repair');
console.log('PASS geometry still legal for active villas');
