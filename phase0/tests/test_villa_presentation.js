const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),p=require('../villa_presentation.js');
const report=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../output/checks/image-reduction-20260915/report.json'),'utf8'));
for(const layout of report.layouts){
 for(const active of [layout.units.map(u=>u.active),layout.units.map(()=>false),layout.units.map((u,i)=>i===0)]){
  const result=p.exportPlan(report,layout,active,true),ids=[...result.svg.matchAll(/data-villa-id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(ids,layout.units.filter((u,i)=>active[i]).map(u=>u.id));assert(!/NaN|undefined|Infinity/.test(result.svg));assert(result.width>0&&result.height>0);
 }
}
const savedSet=global.setTimeout,savedClear=global.clearTimeout;let now=0,next=0,timers=new Map();
global.setTimeout=(fn,delay)=>{timers.set(++next,{fn,at:now+delay});return next;};global.clearTimeout=id=>timers.delete(id);global.window={innerWidth:800,innerHeight:600};
const advance=ms=>{now+=ms;for(const [id,t] of timers)if(t.at<=now){timers.delete(id);t.fn();}};
const node={},tip={hidden:true,style:{},offsetWidth:70,offsetHeight:30},cleanup=p.bindHover(node,'V035',tip),event={clientX:790,clientY:590,pointerType:'mouse'};
node.onpointerenter(event);assert(!tip.hidden);assert.equal(timers.size,0);assert.equal(tip.textContent,'V035');assert(parseInt(tip.style.left)<=722);assert(parseInt(tip.style.top)<=562);
node.onpointerleave();assert(tip.hidden);node.onpointerenter(event);advance(100);node.onpointerleave();advance(300);assert(tip.hidden);
node.onpointerenter(event);cleanup();advance(300);assert(tip.hidden);global.setTimeout=savedSet;global.clearTimeout=savedClear;
console.log('PASS instant hover, cancelled hover, viewport bounds, active-only export across four layouts');
