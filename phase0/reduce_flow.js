// Use the same bounded pad solver as the interactive viewer for offline reduction.
const fs=require('node:fs'),model=require('./reduction_model.js');
const layout=JSON.parse(fs.readFileSync(0,'utf8')),active=layout.units.map(u=>u.active??true),history=[];
let state;
while(active.some(Boolean)){
 state=model.solve(layout,active,state?.z||layout.units.map(u=>u.z??u.reference));
 if(state.valid)break;
 const candidates=active.map((v,i)=>v?i:-1).filter(i=>i>=0).sort((a,b)=>state.covered[b]-state.covered[a]||b-a);
 const i=candidates[0];active[i]=false;history.push({id:layout.units[i].id,reason:'view / elevation'});
}
let changed;
do{
 changed=false;
 for(let i=0;i<active.length;i++)if(!active[i]){
  active[i]=true;const test=model.solve(layout,active,state.z);
  if(test.valid){state=test;changed=true;}else active[i]=false;
 }
}while(changed);
process.stdout.write(JSON.stringify({active,history,z:state.z,valid:state.valid}));
