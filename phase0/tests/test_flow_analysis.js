const assert=require('node:assert/strict'),fs=require('node:fs');
const model=require('../reduction_model.js'),presentation=require('../villa_presentation.js'),diagrams=require('../elevation_diagrams.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-analysis-20260915/report.json','utf8'));
let count=0;
for(const l of report.layouts){
 const active=l.units.map(u=>u.active),z=l.units.map(u=>u.z);
 assert(model.inspect(l,active,z).valid,l.name);
 assert(model.solve(l,active,z).valid,l.name+' recompute from saved pads');
 assert.equal(l.conflicts.length,0);assert.equal(l.outside.length,0);
 for(let i=0;i<active.length;i++){
  const mask=active.slice();mask[i]=!mask[i];const before=model.inspect(l,mask,z),after=model.solve(l,mask,z);
  after.z.forEach((v,j)=>assert(Number.isFinite(v)&&Math.abs(v-l.units[j].reference)<=1.5+1e-6));
  after.viewBad.forEach((bad,j)=>assert(!bad||before.viewBad[j]));
  if(!active[i])assert(!after.valid,l.name+' '+l.units[i].id+' must not remain ghosted if activation passes');
  assert.equal(diagrams.pairs(l,active,{z},i).length,l.spans[i].length);
  const exported=presentation.exportPlan(report,l,mask,true).svg;
  assert.deepEqual([...exported.matchAll(/data-villa-id="([^"]+)"/g)].map(m=>m[1]),l.units.filter((u,j)=>mask[j]).map(u=>u.id));
  count++;
 }
 console.log(l.name,l.retained_count+'/'+l.initial_count,'verified');
}
const stagger=report.layouts.find(l=>l.name==='staggered-3');
for(const id of ['V015','V030'])assert(stagger.units.find(u=>u.id===id).active,id+' remains active after verified restoration');
console.log('PASS',count,'toggle, bounded-pad, elevation-participant and active-only export checks');
