(async()=>{
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8'),nodes={},frames=[];
const element=id=>nodes[id]??={value:'',textContent:'',innerHTML:'',hidden:true,disabled:false,style:{},querySelectorAll:()=>[],setAttribute(k,v){this[k]=v;},focus(){}};
let lastWorker,terminated=0,revoked=0;
class Worker{constructor(){lastWorker=this;}postMessage(){}terminate(){terminated++;}}
const ctx=vm.createContext({Math,Date,document:{getElementById:element,querySelectorAll:()=>[],activeElement:null},console,setTimeout,clearTimeout,requestAnimationFrame:f=>frames.push(f),Worker,Blob:class{},URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>revoked++}});
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);
const run=s=>vm.runInContext(s,ctx);
// Actual Populate handler: overlay visible and page inert BEFORE work is scheduled.
const pending=run("$('populateOptimized').onclick()");
assert.equal(element('calculation-overlay').hidden,false);
assert.equal(element('app-content').inert,true);
assert.equal(element('app-content')['aria-busy'],'true');
assert.equal(frames.length,1);
await run("$('populateOptimized').onclick()");assert.equal(frames.length,1,'duplicate clicks cannot launch more work');
frames.shift()();await pending;
assert(element('action-message').textContent.includes('Cannot populate'),'validation still runs');
assert.equal(element('calculation-overlay').hidden,true);assert.equal(element('app-content').inert,false);
// An exception in a synchronous fitting calculation always releases the page.
run("TerrainEdit.apply=()=>{throw Error('fixture failure')}");
const failed=run("$('startFitting').onclick()");frames.shift()();await failed;
assert(element('status').textContent.includes('fixture failure'));assert.equal(run('fittingBusy'),false);assert(element('calculation-overlay').hidden);
// Worker progress shows real status, no invented percent; errors and success release the overlay.
run("run('reduce')");assert.equal(element('calculation-overlay').hidden,false);
lastWorker.onmessage({data:{progress:true,count:25}});
assert(element('calculation-detail').textContent.includes('25 villas'));
lastWorker.onmessage({data:{error:'worker fixture failure'}});
assert(element('calculation-overlay').hidden);assert.equal(run('busy'),false);assert(terminated>0);
run("run('reduce')");lastWorker.onmessage({data:{result:run('state')}});
assert(element('calculation-overlay').hidden);assert.equal(run('busy'),false);
run("run('reduce')");lastWorker.onerror({message:'worker crashed'});assert(element('calculation-overlay').hidden);
ctx.Worker=class{constructor(){throw Error('worker unavailable')}};
run("run('reduce')");assert(element('status').textContent.includes('worker unavailable'));assert(element('calculation-overlay').hidden);assert.equal(run('busy'),false);assert(revoked>=4);
assert(!html.includes('role="progressbar"'),'no false completion percentage');
console.log('PASS calculation overlay: paints first, prevents duplicate work, marks page busy, reports real search status, and clears after success/validation/errors/worker startup failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
