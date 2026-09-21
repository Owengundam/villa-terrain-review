const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),P=require('../parallel_para.js');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1],nodes={},workers=[];
function element(id){return nodes[id]??={value:'',textContent:'',innerHTML:'',hidden:true,style:{},querySelectorAll:()=>[]};}
class Worker{constructor(){workers.push(this);}postMessage(input){this.input=input;}terminate(){this.terminated=true;}}
const ctx=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout,Worker,Blob,URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}}});
new vm.Script(script).runInContext(ctx);
vm.runInContext(`data.boundary=[[0,0],[90,0],[90,100],[0,100]];data.layouts=[{name:'parallelPara',conflicts:[],outside:[],units:[{id:'A',center:[25,30],view:[0,-1],row:'R1',order:0,points:ParallelPara.rect([25,30],[0,-1],11,23),reference:10,z:10,active:true},{id:'B',center:[45,30],view:[0,-1],row:'R1',order:1,points:ParallelPara.rect([45,30],[0,-1],11,23),reference:10,z:10,active:true}]}];index=0;active=[true,true];state=View3D.inspect(data.layouts[0],active,[10,10],rules);`,ctx);
element('roadWidth').value='4';element('roadEdge').value='0';element('backClear').value='7';element('arrivalWidth').value='1.5';
element('generateRoads').onclick();assert.equal(workers.length,1);
const source=vm.runInContext('roadWorkerSource',ctx),messages=[],workerCtx=vm.createContext({postMessage:m=>messages.push(m)});new vm.Script(source).runInContext(workerCtx);workerCtx.onmessage({data:workers[0].input});
assert(!messages.at(-1).error,messages.at(-1).error);workers[0].onmessage({data:messages.at(-1)});
assert(element('roadStatus').textContent.includes('0/2'));assert(element('roadStatus').textContent.includes('not evaluated'));assert(element('map').innerHTML.includes('#d39732'));
console.log('PASS actual page handler and bundled road worker, reservation-only overlay');
element('roadWidth').value='5';element('roadWidth').onchange();assert(element('roadStatus').textContent.includes('OUT OF DATE'));
element('generateRoads').onclick();const pending=workers.at(-1);element('cancelRoads').onclick();pending.onmessage({data:messages.at(-1)});assert(element('roadStatus').textContent.includes('cancelled'));
console.log('PASS stale width and cancelled-worker late result ignored');
element('generateRoads').onclick();const changed=workers.at(-1);element('roadWidth').value='3';changed.onmessage({data:messages.at(-1)});assert(element('roadStatus').textContent.includes('discarded'));
element('roadWidth').value='4';vm.runInContext("roadEntrance=[10,70]",ctx);element('generateRoads').onclick();const connected=workers.at(-1);messages.length=0;workerCtx.onmessage({data:connected.input});assert(!messages.at(-1).error,messages.at(-1).error);connected.onmessage({data:messages.at(-1)});assert(element('roadStatus').textContent.includes('2/2'));
vm.runInContext('state.z[0]+=1;draw()',ctx);assert(element('roadStatus').textContent.includes('OUT OF DATE'));
console.log('PASS input changes discard pending results, entrance network and pad edits invalidate');
