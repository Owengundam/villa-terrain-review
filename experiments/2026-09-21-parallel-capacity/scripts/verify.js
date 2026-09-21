const fs=require('node:fs'),assert=require('node:assert/strict'),P=require('../../../phase0/parallel_para.js');
const root='experiments/2026-09-21-parallel-capacity',data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
for(const level of [0,2]){
 const sm=P.smoothContours(data.contours,level),after=P.generateLayout(data,{smoothed:sm,terrainLines:data.contours}),before=JSON.parse(fs.readFileSync(`${root}/checks/before-${level}.json`));
 assert(after.ok);assert.equal(after.units.length,47);assert.equal(new Set(after.units.map(u=>u.id)).size,after.units.length);assert(after.units.length>before.units.length);
 const field=P.buildField(sm,after.params),drop=P.buildField(data.contours,after.params);
 for(const u of after.units){assert(P.groundDrop(drop,u.center,u.view,23,11).ok);assert(P.withinTol(u.view,field.normalAt(...u.center),15));}
 assert(P.validate(after,data.boundary,after.params).ok);
 fs.writeFileSync(`${root}/checks/after-${level}.json`,JSON.stringify(after,null,2));
 console.log(JSON.stringify({level,before:before.units.length,after:after.units.length,uniqueIds:47,geometry:true,orientation:true,downhill:true,elapsedMs:after.elapsedMs}));
}
