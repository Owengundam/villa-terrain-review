const fs=require('node:fs'),P=require('../inputs/parallel_para.before.js');
const data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8')),lvl=0,sm=P.smoothContours(data.contours,lvl),par=P.settings({}).values;par.maxUnits=300;
const f=P.buildField(sm,par),d=P.buildField(data.contours,par),b=data.boundary;
const variants=[];
for(const fam of P.buildGuideFamilies(f,b,par,sm))for(const phase of [0,5,10])for(const dir of [1,-1]){
 const v=P.runVariant(fam.guides,b,f,d,par,phase,dir,300),rows=P.rowsOf(v.units,fam.guides,par),validation=P.validate(v,b,par);
 const metrics=P.metrics({...v,rows},b,f,par,{validation});
 if(validation.ok)variants.push({...v,...fam,metrics});
}
variants.sort((a,b)=>b.units.length-a.units.length||a.metrics.spacing.extraSpacing-b.metrics.spacing.extraSpacing||a.metrics.heading.jitter-b.metrics.heading.jitter||a.delta-b.delta||a.phase-b.phase||a.dir-b.dir);
for(const [rank,v] of variants.slice(0,6).entries()){
 const t=Date.now();P.recover(v,b,f,d,par,v.guides);
 const r=P.densifyLayout(v,v.guides,b,f,d,par,{densify:{repackNeighbors:false,siblings:false}});
 console.log(JSON.stringify({rank,n:r.units.length,ms:Date.now()-t}));
}
