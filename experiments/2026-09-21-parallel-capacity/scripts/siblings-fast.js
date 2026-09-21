const fs=require('node:fs');
const file='experiments/2026-09-21-parallel-capacity/scripts/sibling-candidate.js';
fs.writeFileSync(file,fs.readFileSync('phase0/parallel_para.js','utf8').replace('if(guideTooClose(sib,live,minSep*0.9)){serial--;continue;}','/* Footprint checks decide local fit. */'));
const P=require('./sibling-candidate.js'),data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
for(const lvl of [0,2]){
 const r=P.generateLayout(data,{smoothed:P.smoothContours(data.contours,lvl),terrainLines:data.contours});
 console.log(JSON.stringify({lvl,n:r.units.length,ok:r.ok,ms:r.elapsedMs,densify:r.densify,orientation:r.metrics.orientation}));
 fs.writeFileSync(`experiments/2026-09-21-parallel-capacity/checks/siblings-fast-${lvl}.json`,JSON.stringify(r,null,2));
}
