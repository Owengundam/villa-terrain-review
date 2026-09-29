const assert=require('node:assert/strict'),fs=require('node:fs'),O=require('../optimized_population.js'),audit=require('./optimized_audit.js');
const boundary=[[0,0],[100,0],[100,100],[0,100]],contours=[{z:30,points:[[0,0],[100,0]]},{z:0,points:[[0,100],[100,100]]}],data={boundary,contours};
const before=JSON.stringify(data),a=O.generate(data),b=O.generate(data);
assert(a.ok);assert.deepEqual(a.units,b.units);assert.equal(JSON.stringify(data),before);assert(a.units.length>=a.search.baseline);assert(!a.search.provenOptimal);audit(a,boundary);
for(const u of a.units){assert(!('row' in u));assert(u.view[1]>0,'analytic slope faces downhill');assert(Math.acos(u.view[1])*180/Math.PI<=15.000001);}
assert(!O.generate(data,{sideGap:''}).ok);
assert(!O.generate({boundary,contours:[contours[0]]}).ok,'ambiguous terrain must not invent a population');
// Graph search must replace the blocking centre to select two compatible neighbours.
const edges=[new Set([1,2]),new Set([0]),new Set([0])],cand=[{center:[0,0]},{center:[5,0]},{center:[-5,0]}];
assert.equal(O.improve(cand,edges,[0],()=>.5,()=>{}).length,2);
// Two rear strips can overlap legally; only building intrusion is disallowed.
const P=require('../parallel_para.js'),par=P.settings({}).values,cs=[],g=O.graph(cs,par);
const mk=(c,v)=>({center:c,view:v,width:11,depth:23,points:P.rect(c,v,11,23)});
g.append([mk([0,0],[0,-1]),mk([0,31],[0,1])]);assert.equal(g.edges[0].size,0);
// Independent auditor catches planted violations even if output claims success.
const corrupt=JSON.parse(JSON.stringify(a));corrupt.units[1].center=corrupt.units[0].center.slice();assert.throws(()=>audit(corrupt,boundary));
console.log('PASS optimized population: deterministic, source unchanged, independent geometry, analytic downhill/orientation, no row metadata, neighbourhood exchange, invalid inputs and legal overlapping rear strips');
const site=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json'));
const saved=JSON.parse(fs.readFileSync('phase0/saved_optimized_population.json'));
const check=audit(saved,site.boundary);console.log('PASS independent saved-site audit: '+saved.units.length+' villas');

// A house fits but its rear strip exits the top of the site.
const edgeCase={params:par,units:[{id:'edge',center:[50,85],view:[0,-1]}]};
assert.throws(()=>audit(edgeCase,boundary),/rear strip outside site/);
assert(P.validate(edgeCase,boundary,par).issues.some(i=>i.type==='rear-boundary'));
assert.doesNotThrow(()=>audit({...edgeCase,params:{...par,backClear:0}},boundary));

// Concave notch intersects the middle of the rear strip while its corners remain inside.
const notch=[[0,0],[100,0],[100,100],[52,100],[52,96],[48,96],[48,100],[0,100]];
const concave={params:par,units:[{id:'notch',center:[50,80],view:[0,-1]}]};
assert.throws(()=>audit(concave,notch),/rear strip outside site/);
assert(P.validate(concave,notch,par).issues.some(i=>i.type==='rear-boundary'));
const T=require('../terrain_edit.js');
const edgeUnit={...edgeCase.units[0],points:P.rect([50,85],[0,-1],par.width,par.depth)};
const contains=(u,b)=>P.polyInsideBoundary(u.points,b)&&P.polyInsideBoundary(P.rearStrip(u,par.backClear),b);
assert(T.geomCheck({units:[edgeUnit]},boundary,null,par.sideGap,contains).issues.some(i=>i.type==='boundary'));
console.log('PASS rear boundary: straight edge, concave notch, zero clearance, planar geometry callback');
