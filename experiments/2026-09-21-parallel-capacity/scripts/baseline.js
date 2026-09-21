const fs=require('node:fs'),P=require('../inputs/parallel_para.before.js');
const data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
for(const lvl of [0,2]){
 const before=P.generateLayout(data,{smoothed:P.smoothContours(data.contours,lvl),terrainLines:data.contours});
 fs.writeFileSync(`experiments/2026-09-21-parallel-capacity/checks/before-${lvl}.json`,JSON.stringify(before,null,2));
 const after=JSON.parse(fs.readFileSync(`experiments/2026-09-21-parallel-capacity/checks/siblings-fast-${lvl}.json`,'utf8'));
 console.log(JSON.stringify({lvl,before:before.units.length,after:after.units.length,beforeMs:before.elapsedMs,afterMs:after.elapsedMs,uniqueIds:new Set(after.units.map(u=>u.id)).size}));
}
