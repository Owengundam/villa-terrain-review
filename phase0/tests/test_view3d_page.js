const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8'),script=html.match(/<script>([\s\S]*)<\/script>/)[1],nodes={};
function element(id){return nodes[id]??=( {value:'',textContent:'',innerHTML:'',querySelectorAll:()=>[],style:{},hidden:true} );}
const context=vm.createContext({document:{getElementById:element,querySelectorAll:()=>Object.values(nodes)},console,setTimeout,clearTimeout});
new vm.Script(script).runInContext(context);
for(let i=0;i<4;i++){
 element('layout').value=String(i);element('layout').onchange();assert(element('status').textContent.includes('All checks pass'));
 assert(!/NaN|undefined|Infinity/.test(element('map').innerHTML+element('window').innerHTML+element('elevations').innerHTML));
 assert(element('window').innerHTML.includes('Angular view window'));
}
element('bottom').value='2';element('calculate').onclick();assert.equal(element('status').textContent,'Invalid 3D view settings');
const source=vm.runInContext('workerSource',context),messages=[],worker=vm.createContext({postMessage:x=>messages.push(x)});new vm.Script(source).runInContext(worker);
const layout=JSON.parse(vm.runInContext('JSON.stringify(data.layouts[0])',context)),rules=JSON.parse(vm.runInContext('JSON.stringify(data.rules.view3d)',context));
worker.onmessage({data:{op:'fit',layout,active:layout.units.map(u=>u.active),seed:layout.units.map(u=>u.z),rules}});assert(messages.at(-1).result.valid);
console.log('PASS generated page renders four layouts, rejects invalid settings and executes its actual worker fit');
