/* Conservative angular-area visibility for vertical footprint extrusions.
   Each 0.25-degree column encloses the entire silhouette in that column.
   Union vertical intervals before counting area: never double-count overlaps. */
const View3D=(()=>{
 const defaults={eye:1.5,height:5,bottom:-10,top:5,clear:.7,centralClear:.5,pad:1.5};
 const rad=Math.PI/180,cache=new WeakMap();
 function settings(s={}){const r={...defaults,...s};if(!Object.values(r).every(Number.isFinite)||r.eye<.1||r.height<=0||r.bottom>=0||r.top<=0||r.bottom>=r.top||r.clear<0||r.clear>1||r.centralClear<0||r.centralClear>1||r.pad<0)throw Error('Invalid 3D view settings');return r;}
 function clip(poly,a,b){const out=[];for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],u=a*p[0]+b*p[1],v=a*q[0]+b*q[1];if(u>=-1e-10)out.push(p);if((u>0)!==(v>0)){const t=u/(u-v);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}}return out;}
 function prepare(l){if(cache.has(l))return cache.get(l);const rows=l.units.map((u,i)=>{
  const v=u.view,s=[v[1],-v[0]],o=[u.center[0]+11.5*v[0],u.center[1]+11.5*v[1]];
  const polygons=l.units.map(q=>q.points.map(p=>[(p[0]-o[0])*s[0]+(p[1]-o[1])*s[1],(p[0]-o[0])*v[0]+(p[1]-o[1])*v[1]]));
  return Array.from({length:120},(_,k)=>{const lo=(-15+k*.25)*rad,hi=lo+.25*rad,entries=[];
   polygons.forEach((p,j)=>{if(i===j)return;p=clip(clip(p,Math.cos(lo),-Math.sin(lo)),-Math.cos(hi),Math.sin(hi));if(p.length<3)return;
    let near=Infinity,far=0;for(let n=0;n<p.length;n++){const a=p[n],b=p[(n+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));near=Math.min(near,Math.hypot(a[0]+t*dx,a[1]+t*dy));far=Math.max(far,Math.hypot(...a));}
    if(far>1e-8)entries.push([j,Math.max(near,1e-8),far]);
   });return entries;});
 });cache.set(l,rows);return rows;}
 function union(intervals,bottom,top){let end=bottom,total=0;for(const [a,b] of intervals.sort((a,b)=>a[0]-b[0])){const lo=Math.max(a,bottom),hi=Math.min(b,top);total+=Math.max(0,hi-Math.max(lo,end));end=Math.max(end,hi);}return total;}
 function column(l,i,entries,active,z,r){const eye=z[i]+r.eye;return entries.filter(([j])=>active[j]).map(([j,near,far])=>{const base=z[j]-eye,roof=base+(l.units[j].height??r.height);const angles=[Math.atan2(base,near),Math.atan2(base,far),Math.atan2(roof,near),Math.atan2(roof,far)].map(a=>a/rad);return [Math.min(...angles),Math.max(...angles),j];});}
 function centralHalf(r){return Math.min(2.5,-r.bottom,r.top);}
 function measure(l,active,z,r,selected=null){r=settings(r);const rows=prepare(l),half=centralHalf(r);return rows.map((cols,i)=>{
  if(!active[i]&&selected!==i)return {blocked:0,central:0};let total=0,central=0;const strips=[];
  cols.forEach((entries,k)=>{const intervals=column(l,i,entries,active,z,r);total+=union(intervals.slice(),r.bottom,r.top)*.25;
   if(k>=40&&k<80)central+=union(intervals.slice(),-half,half)*.25;
   if(selected===i)strips.push(intervals);
  });return {blocked:total/(30*(r.top-r.bottom)),central:central/(20*half),strips};
 });}
 function inspect(l,active,z,r){r=settings(r);const metrics=measure(l,active,z,r),viewBad=metrics.map((m,i)=>active[i]&&(m.blocked>1-r.clear+1e-9||m.central>1-r.centralClear+1e-9)),padBad=z.map((v,i)=>active[i]&&(!Number.isFinite(v)||Math.abs(v-l.units[i].reference)>r.pad+1e-7)),conflicts=l.conflicts.filter(([a,b])=>active[a]&&active[b]),outside=l.outside.filter(i=>active[i]);return {z,metrics,viewBad,padBad,conflicts,outside,valid:!viewBad.some(Boolean)&&!padBad.some(Boolean)&&!conflicts.length&&!outside.length};}
 function solve(l,active,seed,r){r=settings(r);let z=l.units.map((u,i)=>Math.max(u.reference-r.pad,Math.min(u.reference+r.pad,seed?.[i]??u.reference))),state=inspect(l,active,z,r);
  const rank=s=>s.metrics.reduce((n,m,i)=>n+(active[i]?Math.max(0,m.blocked-(1-r.clear))+Math.max(0,m.central-(1-r.centralClear)):0),0);
  for(let pass=0;pass<6&&!state.valid;pass++){let best=state,bestRank=rank(state);
   const consider=q=>{const test=inspect(l,active,q,r);if(test.viewBad.some((b,i)=>b&&!state.viewBad[i]))return;const score=rank(test);if(score<bestRank-1e-8){best=test;bestRank=score;}};
   // Shared moves can clear a relationship that neither single move can clear.
   const worst=state.viewBad.map((bad,i)=>bad?i:-1).filter(i=>i>=0).sort((a,b)=>state.metrics[b].blocked+state.metrics[b].central-state.metrics[a].blocked-state.metrics[a].central).slice(0,4);
   worst.forEach(i=>{const counts=new Map();prepare(l)[i].flat().forEach(([j])=>{if(active[j])counts.set(j,(counts.get(j)||0)+1);});const front=[...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)).slice(0,4);
    for(const step of [.5,1,3]){let q=z.slice();q[i]=Math.min(l.units[i].reference+r.pad,z[i]+step);consider(q);
     for(const j of front){q=z.slice();q[j]=Math.max(l.units[j].reference-r.pad,z[j]-step);consider(q);q=q.slice();q[i]=Math.min(l.units[i].reference+r.pad,z[i]+step);consider(q);}
    }
   });if(best===state)break;state=best;z=state.z;
  }return state;
 }
 function reduce(l,r,onProgress=()=>{}){r=settings(r);const active=l.units.map(()=>true);let state=inspect(l,active,l.units.map(u=>u.reference),r),iteration=0;
  while(active.some(Boolean)){state=solve(l,active,state.z,r);onProgress(++iteration,active.filter(Boolean).length);if(state.valid)break;let worst=-1,score=-1;state.metrics.forEach((m,i)=>{if(active[i]&&m.blocked+m.central>score){worst=i;score=m.blocked+m.central;}});active[worst]=false;}
  let changed;do{changed=false;for(let i=0;i<active.length;i++)if(!active[i]){active[i]=true;const test=solve(l,active,state.z,r);if(test.valid){state=test;changed=true;}else active[i]=false;}}while(changed);
  state=inspect(l,active,state.z,r);return {active,...state};
 }
 function edit(l,current,seed,index,auto,heldOff=[],r=defaults){
  const active=current.slice(),off=new Set(heldOff),activating=!active[index];active[index]=activating;
  let state=activating?solve(l,active,seed,r):inspect(l,active,seed.slice(),r);
  if(auto&&activating){
   // The clicked villa is protected; resolve conflicts by removing other villas.
   while(!state.valid){
    let victim=state.outside.find(i=>i!==index);
    if(victim===undefined&&state.conflicts.length){const pair=state.conflicts[0];victim=pair.find(i=>i!==index);}
    if(victim===undefined){const failed=state.viewBad.flatMap((bad,i)=>bad&&i!==index?[i]:[]);failed.sort((a,b)=>state.metrics[b].blocked+state.metrics[b].central-state.metrics[a].blocked-state.metrics[a].central);victim=failed[0];}
    if(victim===undefined&&state.viewBad[index]){
     const blockers=[...new Set(prepare(l)[index].flat().map(e=>e[0]).filter(j=>active[j]&&j!==index))];
     let largest=-1;for(const j of blockers){const mask=active.map((_,k)=>k===j),m=measure(l,mask,state.z,r,index)[index],score=m.blocked+m.central;if(score>largest){largest=score;victim=j;}}
    }
    if(victim===undefined)throw Error('Selected villa has an intrinsic geometry or pad issue that removing neighbours cannot resolve.');
    active[victim]=false;state=solve(l,active,state.z,r);
   }
  }
  if(!state.valid){
   const reasons=[];const ids=state.viewBad.flatMap((bad,i)=>bad?[l.units[i].id]:[]);
   if(ids.length)reasons.push('view requirements for '+ids.join(', '));
   if(state.conflicts.length)reasons.push('clearance / overlap requirements');
   if(state.outside.length)reasons.push('site boundary');
   if(state.padBad.some(Boolean))reasons.push('pad limits');
   return {...inspect(l,current,seed.slice(),r),active:current.slice(),heldOff:[...off],changes:[],rejected:true,message:`Cannot activate ${l.units[index].id}: this action would break ${reasons.join('; ')} under the current pad search. Previous plan kept.`};
  }
  if(activating)off.delete(index);else{
   off.add(index);
   if(auto){let changed;do{changed=false;for(let i=0;i<active.length;i++)if(!active[i]&&!off.has(i)){
    const trial=active.slice();trial[i]=true;const candidate=solve(l,trial,state.z,r);
    if(candidate.valid){active[i]=true;state=candidate;changed=true;}
   }}while(changed);}
  }
  const changes=l.units.flatMap((u,i)=>{const type=active[i]!==current[i]?(active[i]?'activated':'deactivated'):active[i]&&Math.abs(state.z[i]-seed[i])>1e-6?'pad-adjusted':null;return type?[{index:i,id:u.id,type,automatic:i!==index,padDelta:state.z[i]-seed[i]}]:[];});
  const added=changes.filter(c=>c.automatic&&c.type==='activated').map(c=>c.id),removed=changes.filter(c=>c.automatic&&c.type==='deactivated').map(c=>c.id);
  return {...state,active,heldOff:[...off],changes,rejected:false,message:`${l.units[index].id} ${activating?'activated':'deactivated'}.`+(added.length?' Auto-activated: '+added.join(', ')+'.':'')+(removed.length?' Auto-deactivated: '+removed.join(', ')+'.':'')+' All requirements pass.'};
 }
 return {defaults,settings,centralHalf,prepare,column,union,measure,inspect,solve,reduce,edit};
})();
if(typeof module!=='undefined')module.exports=View3D;
