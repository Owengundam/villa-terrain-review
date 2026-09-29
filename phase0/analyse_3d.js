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
const model=fs.readFileSync('phase0/view3d.js','utf8'),presentation=fs.readFileSync('phase0/villa_presentation.js','utf8'),terrain=fs.readFileSync('phase0/terrain_edit.js','utf8').replace("if(typeof module!=='undefined')module.exports=TerrainEdit;",""),parallel=fs.readFileSync('phase0/parallel_para.js','utf8').replace("if(typeof module!=='undefined')module.exports=ParallelPara;","");
const worker=model+`\nonmessage=e=>{try{const {op,layout,active,seed,rules,selected,auto,heldOff}=e.data;const result=op==='reduce'?View3D.reduce(layout,rules,(iteration,count)=>postMessage({progress:true,iteration,count})):op==='edit'?View3D.edit(layout,active,seed,selected,auto,heldOff,rules):View3D.solve(layout,active,seed,rules);postMessage({result});}catch(e){postMessage({error:String(e)});}};`;
const clipper='const ClipperLib=(()=>{const module={exports:{}};\n'+fs.readFileSync('node_modules/clipper-lib/clipper.js','utf8')+'\nreturn module.exports;})();';
const triangulation='/* '+fs.readFileSync('node_modules/delaunator/LICENSE','utf8')+' */\nconst Delaunator=(()=>{const exports={};const module={exports};\n'+fs.readFileSync('node_modules/delaunator/delaunator.js','utf8')+'\nreturn module.exports;})();\n'+fs.readFileSync('phase0/road_terrain.js','utf8');
const circulation=triangulation+'\n'+fs.readFileSync('phase0/circulation.js','utf8');
const roadWorkerSource=clipper+'\n'+parallel+'\n'+circulation+'\nonmessage=e=>{try{postMessage({result:Circulation.generate(e.data,progress=>postMessage({progress}))});}catch(e){postMessage({error:e.message});}};';
const populationWorkerSource=parallel+'\n'+fs.readFileSync('phase0/optimized_population.js','utf8')+'\nonmessage=e=>{try{postMessage({result:OptimizedPopulation.generate(e.data.data,e.data.options,progress=>postMessage({progress}))});}catch(e){postMessage({error:e.message});}};';
// Keep historic analysis reports intact; ship only the audited optimized population.
const savedPopulation=JSON.parse(fs.readFileSync('phase0/saved_optimized_population.json','utf8'));
const terrainModel=require('./terrain_edit.js');
const terrainSamples=terrainModel.samples(terrainModel.buildFromContours(report.contours));
for(const u of savedPopulation.units){u.reference=terrainModel.elevation(u.center[0],u.center[1],terrainSamples);u.z=u.reference;u.active=true;}
const viewerReport={...report,layouts:[{name:'optimized',units:savedPopulation.units,params:savedPopulation.params,metrics:savedPopulation.metrics,conflicts:[],outside:[],spans:[],populationReport:'Saved optimized population: '+savedPopulation.units.length+' villas. Geometry checked; view fitting and circulation remain separate. Best found; maximum not proven.',verification:{geometry:savedPopulation.validation,search:savedPopulation.search}}]};
const html=fs.readFileSync('phase0/view3d_view.html','utf8').replace('/*__CIRCULATION__*/',()=>clipper+'\n'+circulation+'\nconst roadWorkerSource='+JSON.stringify(roadWorkerSource)+';').replace('/*__CIRCULATION_UI__*/',()=>fs.readFileSync('phase0/circulation_ui.js','utf8')).replace('/*__POPULATION_WORKER__*/',()=>JSON.stringify(populationWorkerSource)).replace('/*__MODEL__*/',model).replace('/*__SMOOTHING__*/','').replace('/*__PARALLEL__*/',parallel).replace('/*__TERRAIN__*/',terrain).replace('/*__PRESENTATION__*/',presentation).replace('/*__DATA__*/',JSON.stringify(viewerReport)).replace('/*__WORKER__*/',JSON.stringify(worker));
fs.writeFileSync(path.join(out,'index.html'),html);
