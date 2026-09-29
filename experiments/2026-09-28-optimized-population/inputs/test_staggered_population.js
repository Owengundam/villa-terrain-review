const fs=require('node:fs'),assert=require('node:assert/strict'),P=require('../parallel_para.js');
const boundary=[[0,0],[160,0],[160,160],[0,160]],contours=[30,60,90,120].map(y=>({z:200-y,points:[[0,y],[160,y]]}));
const opts={arrangement:'staggered',terrainLines:contours,smoothed:contours};
const a=P.generateLayout({boundary,contours},opts),b=P.generateLayout({boundary,contours},opts);
assert(a.ok);assert.deepEqual(a.units,b.units);assert(P.validate(a,boundary,a.params).ok);
assert.equal(a.params.alongPitch,15);assert.equal(a.params.acrossPitch,31);
const rows=a.rows.filter(r=>r.units.length);
assert(rows.length>=3);
for(const r of rows){assert(Number.isFinite(r.staggerPhase));for(const id of r.units){const u=a.units.find(u=>u.id===id),frac=((u.center[0]-r.staggerPhase)%15+15)%15;assert(Math.min(frac,15-frac)<=2.01,'centre stays close to its row phase');}}
for(const r of rows)for(const q of rows){if(Math.abs(r.offset-q.offset-31)<.01){const diff=((r.staggerPhase-q.staggerPhase)%15+15)%15;assert(Math.abs(diff-7.5)<1e-6,'adjacent rows have half-pitch phase');}}
assert.equal(new Set(a.units.map(u=>u.id)).size,a.units.length);
console.log('PASS analytic stagger: '+a.units.length+' villas, alternating half-pitch rows, deterministic, legal and unique');
const data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json'));
fs.mkdirSync('experiments/2026-09-21-staggered-population/checks',{recursive:true});
for(const scale of [0,2]){
 const sm=P.smoothContours(data.contours,scale),r=P.generateLayout(data,{arrangement:'staggered',smoothed:sm,terrainLines:data.contours});
 assert(r.ok);assert(P.validate(r,data.boundary,r.params).ok);assert.equal(new Set(r.units.map(u=>u.id)).size,r.units.length);
 const f=P.buildField(sm,r.params),d=P.buildField(data.contours,r.params);
 for(const u of r.units){assert(P.groundDrop(d,u.center,u.view,23,11).ok);assert(P.withinTol(u.view,f.normalAt(...u.center),15));}
 fs.writeFileSync('experiments/2026-09-21-staggered-population/checks/scale-'+scale+'.json',JSON.stringify(r,null,2));
 console.log('PASS saved-site stagger scale '+scale+': '+r.units.length+' villas; geometry, orientation, downhill and IDs valid ('+r.elapsedMs+' ms)');
}
