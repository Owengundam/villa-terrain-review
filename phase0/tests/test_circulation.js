const assert=require('node:assert/strict'),fs=require('node:fs'),C=require('../circulation.js'),P=require('../parallel_para.js');
function villa(id,x,y,row='R1',order=0,view=[0,-1]){return {id,center:[x,y],view,row,order,points:P.rect([x,y],view,11,23),active:true};}
const units=[villa('A',25,30,'R1',0),villa('B',45,30,'R1',1),villa('C',25,65,'R2',0),villa('D',45,65,'R2',1)];
const input={layout:{units},boundary:[[0,0],[90,0],[90,100],[0,100]],active:[true,true,true,true],settings:{width:4,backClear:7},entrance:[10,90]};
const saved=JSON.stringify(input),r=C.generate(input);
assert.equal(JSON.stringify(input),saved,'fixed layout and settings are immutable');assert.equal(r.connected,4);assert.equal(r.validation.ok,true);assert.equal(r.terrain,'Not evaluated');
assert.deepEqual(C.generate(input),r,'deterministic');
assert.equal(r.roads.filter(r=>r.kind==='row').length,2);assert(r.served.every(v=>v.route.length));
console.log('PASS straight shared lanes, multi-row entrance network, determinism and immutable inputs');
assert.throws(()=>C.generate({...input,settings:{width:''}}),/width/);assert.throws(()=>C.generate({...input,settings:{width:8}}),/exceeds/);
assert.throws(()=>C.generate({...input,entrance:[0,90]}),/interior/);
const noEntrance=C.generate({...input,entrance:null});assert.equal(noEntrance.connected,0);assert(noEntrance.served.every(v=>v.status==='Reservation only'));
console.log('PASS missing/oversized width, boundary entrance and reservation-only status');
const narrow=villa('edge',25,86);const edge=C.generate({...input,layout:{units:[narrow]},active:[true],entrance:null});assert.equal(edge.nodes.length,0);assert(edge.warnings.some(w=>w.villa==='edge'));
const ghost=villa('ghost',35,50,'G');const withGhost=C.generate({...input,layout:{units:[...units,ghost]},active:[true,true,true,true,false],entrance:null});
for(const road of withGhost.roads)assert(C.environment(input.boundary,[ghost]).check(road.envelope.map(C.ring)).ok);
console.log('PASS boundary-clipped rear space rejected and ghosts protected');
const rotated={...input,layout:{units:[villa('R',35,35,'R1',0,[.6,-.8]),villa('S',57,47,'R1',1,[.4,-Math.sqrt(.84)])]},active:[true,true],entrance:null};
const rr=C.generate(rotated);assert(C.validate(rr,rotated).ok);assert.equal(rr.nodes.length,2);
const broken=structuredClone(r);broken.roads.find(x=>x.kind==='connector').points[0]=[25,30];assert(!C.validate(broken,input).ok);
const lie=structuredClone(noEntrance);lie.served[0].connected=true;assert(!C.validate(lie,{...input,entrance:null}).ok);
const missingEntry=structuredClone(r);missingEntry.roads=missingEntry.roads.filter(x=>x.kind!=='entrance');assert(!C.validate(missingEntry,input).ok);
console.log('PASS rotated geometry and independently rejected route/connectivity corruption');
const route=C.router(input.boundary,[villa('block',45,50)],2,2).route([20,50],[70,50]);assert(route&&route.length>2);assert(C.environment(input.boundary,[villa('block',45,50)]).check(C.buffer(route,2)).ok);
console.log('PASS width-aware obstacle detour');
if(process.argv.includes('--site')){
 const site=JSON.parse(fs.readFileSync('experiments/2026-09-21-parallel-capacity/inputs/site-report.json','utf8'));
 const layout=JSON.parse(fs.readFileSync('experiments/2026-09-21-parallel-capacity/checks/after-0.json','utf8'));
 const real={layout,boundary:site.boundary,settings:{width:4,backClear:7},entrance:null};const result=C.generate(real);assert(result.validation.ok);
 fs.mkdirSync('experiments/2026-09-21-circulation/checks',{recursive:true});fs.writeFileSync('experiments/2026-09-21-circulation/checks/real-row-preview.json',JSON.stringify(result,null,2));
 console.log('PASS saved 47-villa row preview:',JSON.stringify({arrivalPoints:result.nodes.length,roads:result.roads.length,warnings:result.warnings.length,connected:result.connected}));
}
