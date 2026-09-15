const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const model=require('../reduction_model.js');
const report=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../output/checks/image-reduction-20260915/report.json'),'utf8'));
let toggles=0;
for(const l of report.layouts){
 const initial=l.units.map(u=>u.active),saved=model.inspect(l,initial,l.units.map(u=>u.z));
 assert(saved.valid,l.name+' saved solution');
 assert(model.solve(l,initial).valid,l.name+' recomputed solution');
 for(let i=0;i<initial.length;i++){
  const active=initial.slice();active[i]=!active[i];const copy=active.slice(),seed=l.units.map(u=>u.z),before=model.inspect(l,active,seed),result=model.solve(l,active,seed);
  assert.deepEqual(active,copy,'solver must not delete or activate units');
  assert.equal(active.filter(Boolean).length,initial.filter(Boolean).length+(initial[i]?-1:1));
  result.z.forEach((z,j)=>assert(Number.isFinite(z)&&Math.abs(z-l.units[j].reference)<=1.5+1e-6,'bounded pads'));
  result.viewBad.forEach((bad,j)=>assert(!bad||before.viewBad[j],'auto padding must not newly break a passing view'));
  const expected=l.conflicts.filter(([a,b])=>active[a]&&active[b]);assert.deepEqual(result.conflicts,expected);
  result.covered.forEach((c,j)=>assert.equal(result.viewBad[j],active[j]&&c>Math.PI/20+1e-9));
  active[i]=!active[i];assert.deepEqual(active,initial);assert(model.solve(l,active).valid,'toggle back restores feasible state');toggles++;
 }
 const full=model.solve(l,initial.map(()=>true));assert(!full.valid,'unreduced full plan must expose conflicts');
 assert(full.viewBad.some(Boolean),'full plan must expose red view cones');
 assert(full.conflicts.length>0,'full plan must expose strict clearance conflicts');
 console.log(l.name,initial.filter(Boolean).length,'retained; all-active:',full.viewBad.filter(Boolean).length,'view failures,',full.conflicts.length,'geometry conflicts');
}
assert(Math.abs(model.union([[0,.2],[.1,.3]])-.3)<1e-12,'overlapping angular spans counted only once');
console.log('PASS',toggles,'individual toggle / toggle-back scenarios');
// Reproduce the user's exact old V035 -> V025 complaint under its original pad bounds.
const old=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../output/checks/image-reduction-20260915/report-before-downhill-fix.json'),'utf8')).layouts[3];
assert(!old.spans[24].some(([j])=>j===34),'V035 is not in V025 cone');
const active=old.units.map(u=>u.active);active[34]=true;
const corrected=model.solve(old,active,old.units.map(u=>u.z),3);
assert(!corrected.viewBad[24],'V035 activation must not break V025 through a failed pad fit');
console.log('PASS original V035 / V025 regression');
