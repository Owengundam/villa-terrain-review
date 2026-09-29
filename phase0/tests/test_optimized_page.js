(async()=>{
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8'),nodes={},workers=[];
const element=id=>nodes[id]??={value:'',textContent:'',innerHTML:'',hidden:true,disabled:false,style:{},querySelectorAll:()=>[]};
class Worker{constructor(){workers.push(this);}postMessage(data){this.input=data;}terminate(){this.terminated=true;}}
const ctx=vm.createContext({Math,Date,document:{getElementById:element,querySelectorAll:()=>[]},console,setTimeout,clearTimeout,Worker,Blob,URL:{createObjectURL:()=>'blob:test',revokeObjectURL:()=>{}}});
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1],ctx);const run=s=>vm.runInContext(s,ctx);
assert.equal(run('data.layouts.length'),1);assert.equal(run('data.layouts[0].name'),'optimized');assert(!html.includes('id="populateStaggered"'));assert(!html.includes('id="populate"'));assert(!html.includes('id="guideOverlay"'));assert.equal(run('data.layouts[0].units.length'),JSON.parse(fs.readFileSync('phase0/saved_optimized_population.json')).units.length);
run("data.boundary=[[0,0],[70,0],[70,90],[0,90]];data.contours=[{z:20,points:[[0,0],[70,0]]},{z:0,points:[[0,90],[70,90]]}]");
for(const [id,val] of [['sideGap','3'],['backClear','7'],['perpTol','15']])element(id).value=val;
const pending=run("$('populateOptimized').onclick()");await new Promise(r=>setTimeout(r,10));assert.equal(workers.length,1);assert(!element('calculation-overlay').hidden);assert(!element('cancelPopulation').hidden);
workers[0].onmessage({data:{progress:{message:'Searching',best:10}}});assert(element('calculation-detail').textContent.includes('10'));
const messages=[],worker=vm.createContext({Math,Date,postMessage:m=>messages.push(m)});vm.runInContext(run('populationWorkerSource'),worker);worker.onmessage({data:workers[0].input});
const result=messages.at(-1);assert(!result.error,result.error);assert(result.result.ok);workers[0].onmessage({data:result});await pending;
assert.equal(run('data.layouts[index].name'),'optimized');assert(run('data.layouts[index].units.every(u=>u.row===undefined)'));assert(element('calculation-overlay').hidden);assert(workers[0].terminated);assert(element('action-message').textContent.includes('maximum not proven'));
const saved=run('JSON.stringify(data.layouts)');
const cancelled=run("$('populateOptimized').onclick()");await new Promise(r=>setTimeout(r,10));const late=workers.at(-1);element('cancelPopulation').onclick();await cancelled;late.onmessage({data:result});assert.equal(run('JSON.stringify(data.layouts)'),saved);assert(element('calculation-overlay').hidden);
const failed=run("$('populateOptimized').onclick()");await new Promise(r=>setTimeout(r,10));workers.at(-1).onerror({message:'fixture error'});await failed;assert.equal(run('JSON.stringify(data.layouts)'),saved);
await run("$('restore').onclick()");assert.equal(run('data.layouts.length'),1);assert.equal(run('index'),0);assert.equal(run('data.layouts[0].name'),'optimized');assert.equal(run('data.layouts[0].units.length'),JSON.parse(fs.readFileSync('phase0/saved_optimized_population.json')).units.length);assert(!element('layout').innerHTML.includes('Staggered'));assert(!element('layout').innerHTML.includes('Free'));
console.log('PASS actual optimized worker and UI: row-free output, optimized-only saved plan, retired methods absent, progress, cancellation/late results/errors preserve layout, restore works');
})().catch(e=>{console.error(e);process.exitCode=1;});
