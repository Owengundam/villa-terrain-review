const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('../road_terrain'),C=require('../circulation');
const plane=[0,50,100].map(y=>({z:100+y*.08,points:[[0,y],[50,y],[100,y]]})),before=JSON.stringify(plane),t=T.reference(plane);
for(const x of [0,17.4,50,99,100])for(const y of [0,12.3,49.99999,50,50.00001,81,100])assert(Math.abs(t.zAt(x,y)-(100+y*.08))<1e-8,'planar height and continuity across facets');
assert.equal(JSON.stringify(plane),before);assert.equal(t.zAt(101,50),null);assert.equal(t.zAt(50,-1),null);
const reversed=T.reference(plane.slice().reverse().map(c=>({...c,points:c.points.slice().reverse()})));
assert.equal(t.zAt(17.4,51),reversed.zAt(17.4,51));
assert.throws(()=>T.reference([{z:1,points:[[0,0],[10,0]]},{z:2,points:[[0,0],[10,0]]}]),/Conflicting/);
assert.throws(()=>T.reference([{z:1,points:[[0,0],[10,0]]},{z:1,points:[[10,0],[20,0]]}]),/usable surface/);
console.log('PASS continuous planar terrain, preserved source, stable ordering, hull coverage and conflicting/collinear data');

const exported=JSON.parse(fs.readFileSync('experiments/2026-09-21-circulation/inputs/user-rejected-network.json','utf8')),snapshot=JSON.parse(exported.fingerprint);
function run(maxSlope,checkSlope){return C.generate({...snapshot,settings:{...snapshot.settings,maxSlope,checkSlope}});}
const high=run(100,true),off=run(100,false),eight=run(8,true);
assert.equal(high.connected,18,'regression: formerly 0/18 at 100%');assert.equal(off.connected,18);assert.equal(eight.connected,15);
assert.deepEqual(high.roads.map(r=>[r.kind,r.a,r.b,r.points]),off.roads.map(r=>[r.kind,r.a,r.b,r.points]),'100% recovers exact plan-only roads on the supplied fixture');
assert(!high.warnings.some(w=>/terrain unresolved/i.test(w.reason)));assert(eight.slope.maxObserved<=8+1e-7);
assert.equal(off.slope.maxObserved,null);assert(off.roads.every(r=>r.profile.evaluated===false));
assert(C.validate(high,{...snapshot,settings:{...snapshot.settings,maxSlope:100}}).ok);
assert(!C.validate(high,{...snapshot,settings:{...snapshot.settings,maxSlope:8}}).ok);
const noTerrain={...snapshot,contours:[],settings:{...snapshot.settings,checkSlope:false}};assert.equal(C.generate(noTerrain).connected,off.connected,'explicit plan-only mode does not consult terrain');
console.log('PASS exact user regression: 100%=18/18 and identical to XY-only; 8%=15/18, max '+eight.slope.maxObserved.toFixed(4)+'%; unchecked results never claim a grade pass');

const latest=JSON.parse(JSON.parse(fs.readFileSync('experiments/2026-09-21-circulation/inputs/user-rear-access-rejected.json','utf8')).fingerprint);
const repaired=C.generate(latest);
for(const id of ['V041','V079'])assert(repaired.served.find(v=>v.id===id).connected,id+' rear link must not fail due to rounding');
assert(C.validate(repaired,latest).ok);
const strip=[C.ring([[0,0],[10,0],[10,7],[0,7]])];
assert(C.entranceWithinStrip(C.buffer([[5,3],[5,0]],.75,true),strip));
assert(!C.entranceWithinStrip(C.buffer([[5,3],[5,-.01]],.75,true),strip),'a real 10 mm departure still fails');
console.log('PASS both reported rear-access links connect at 8%; real reservation departures still fail');
