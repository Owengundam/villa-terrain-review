const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('phase0/parallel_para.js','utf8').replace('if(guideTooClose(sib,live,minSep*0.9)){serial--;continue;}','/* Test actual footprint conflicts instead of rejecting the whole guide. */');
const ctx={module:{exports:{}},console};vm.runInNewContext(src,ctx);const P=ctx.module.exports;
const data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
for(const lvl of [0,2]){
 const r=P.generateLayout(data,{smoothed:P.smoothContours(data.contours,lvl),terrainLines:data.contours});
 console.log(JSON.stringify({lvl,n:r.units.length,ok:r.ok,ms:r.elapsedMs,densify:r.densify,orientation:r.metrics.orientation}));
 fs.writeFileSync(`experiments/2026-09-21-parallel-capacity/checks/local-siblings-${lvl}.json`,JSON.stringify(r,null,2));
}
