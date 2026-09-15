const fs=require('node:fs'),path=require('node:path'),v=require('./view3d.js');
const report=JSON.parse(fs.readFileSync(process.argv.includes('--build-only')?'output/checks/image-flow-3d-20260915/report.json':'output/checks/image-flow-analysis-20260915/report.json','utf8'));
report.rules.view3d=v.defaults;delete report.rules.drop;delete report.rules.minimum_clear;
report.stage='3D angular-area visibility; building-only solid extrusions';
const out='output/checks/image-flow-3d-20260915';fs.mkdirSync(out,{recursive:true});
if(!process.argv.includes('--build-only'))for(const l of report.layouts){
 const start=Date.now(),r=v.reduce(l,v.defaults);if(!r.valid)throw Error(l.name+' failed');
 l.units.forEach((u,i)=>{u.active=r.active[i];u.z=r.z[i];u.reason=u.active?'retained':'3D view obstruction';});l.retained_count=r.active.filter(Boolean).length;
 l.verification={geometry:l.verification,visibility3dPassed:r.valid,maximumBlocked:Math.max(...r.metrics.filter((m,i)=>r.active[i]).map(m=>m.blocked)),maximumCentralBlocked:Math.max(...r.metrics.filter((m,i)=>r.active[i]).map(m=>m.central))};
 console.log(l.name,l.retained_count,'/',l.units.length,'PASS',((Date.now()-start)/1000).toFixed(1)+'s');
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
const model=fs.readFileSync('phase0/view3d.js','utf8'),presentation=fs.readFileSync('phase0/villa_presentation.js','utf8');
const worker=model+`\nonmessage=e=>{try{const {op,layout,active,seed,rules,selected,auto,heldOff}=e.data;const result=op==='reduce'?View3D.reduce(layout,rules,(iteration,count)=>postMessage({progress:true,iteration,count})):op==='edit'?View3D.edit(layout,active,seed,selected,auto,heldOff,rules):View3D.solve(layout,active,seed,rules);postMessage({result});}catch(e){postMessage({error:String(e)});}};`;
const html=fs.readFileSync('phase0/view3d_view.html','utf8').replace('/*__MODEL__*/',model).replace('/*__PRESENTATION__*/',presentation).replace('/*__DATA__*/',JSON.stringify(report)).replace('/*__WORKER__*/',JSON.stringify(worker));
fs.writeFileSync(path.join(out,'index.html'),html);
