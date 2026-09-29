/* Row-free candidate packing. Conflict-graph multi-start and neighbourhood replacement,
 * followed by finer positional candidates. A bounded heuristic, never an optimality proof.
 * Geometry and local terrain constraints stay separate from the search. */
const OptimizedPopulation=(()=>{
 'use strict';
 const P=typeof module!=='undefined'&&module.exports?require('./parallel_para.js'):ParallelPara;
 function random(seed){let x=seed>>>0;return ()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296;};}
 function graph(candidates,par){
  const edges=[],index=P.makeIndex(32);let pairs=0;
  const reach=Math.hypot(par.width,par.depth)+2*par.backClear+par.sideGap;
  function append(units){for(const u of units){
   const i=candidates.length;u.candidate=i;candidates.push(u);edges.push(new Set());
   u.strip=P.rearStrip(u,par.backClear);
   for(const v of index.near(...u.center,reach)){
    if(P.polysOverlap(u.points,v.points)||!P.sideClearance(u,v,par.sideGap,par.eps).ok||
       P.stripIntrusion(u.strip,v.points)||P.stripIntrusion(v.strip,u.points)){
     edges[i].add(v.candidate);edges[v.candidate].add(i);pairs++;
    }
   }
   index.add(u);
  }}
  return {edges,index,append,get pairs(){return pairs;}};
 }
 function greedy(edges,order,initial=[]){
  const selected=initial.slice(),blocked=new Uint8Array(edges.length);
  for(const i of selected){blocked[i]=1;for(const j of edges[i])blocked[j]=1;}
  for(const i of order)if(!blocked[i]){selected.push(i);blocked[i]=1;for(const j of edges[i])blocked[j]=1;}
  return selected;
 }
 // Search can temporarily relocate an entire neighbourhood; only an equal or better
 // complete solution is retained. Equal-size moves let subsequent rounds escape a jam.
 function improve(candidates,edges,initial,rand,notify){
  let best=initial.slice();const n=candidates.length,all=Array.from({length:n},(_,i)=>i);
  const order=all.slice().sort((a,b)=>edges[a].size-edges[b].size||a-b);
  best=greedy(edges,order,best);
  for(let trial=0;trial<8;trial++){
   const keys=all.map(i=>edges[i].size*(.4+rand()));
   const got=greedy(edges,all.slice().sort((a,b)=>keys[a]-keys[b]||a-b));
   if(got.length>best.length)best=got;
  }
  let cur=best.slice();
  for(let step=0;step<240;step++){
   if(!cur.length)break;
   const anchor=candidates[cur[Math.floor(rand()*cur.length)]].center;
   const near=cur.slice().sort((a,b)=>distance(candidates[a].center,anchor)-distance(candidates[b].center,anchor));
   const removed=new Set(near.slice(0,2+step%5)),fixed=cur.filter(i=>!removed.has(i));
   const keys=all.map(i=>edges[i].size*(.25+rand()));
   const local=all.filter(i=>distance(candidates[i].center,anchor)<75).sort((a,b)=>keys[a]-keys[b]||a-b);
   const got=greedy(edges,local,fixed);
   if(got.length>=cur.length)cur=got;
   if(cur.length>best.length){best=cur.slice();notify(best.length);}
   if(step%40===39)cur=best.slice();
  }
  return best;
 }
 function distance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
 function generate(data,opts={},progress=()=>{}){
  const start=Date.now(),st=P.settings(opts);
  if(!st.ok)return {ok:false,error:st.errors.join('; '),units:[]};
  const par=st.values,boundary=data.boundary||[],lines=opts.smoothed||data.contours||[],terrain=opts.terrainLines||lines;
  if(boundary.length<3||!lines.length)return {ok:false,error:'Site boundary and contours are required',units:[]};
  const field=P.buildField(lines,par),dropField=P.buildField(terrain,par),seen=new Set();
  const seed=opts.seed===undefined?20260928:Number(opts.seed),rand=random(seed);
  let evaluated=0;
  function candidate(center,view){
   evaluated++;const key=center.map(x=>x.toFixed(3)).join(',')+':'+view.map(x=>x.toFixed(5)).join(',');
   if(seen.has(key))return null;
   seen.add(key);
   const normal=field.normalAt(...center);
   if(!normal||!P.withinTol(view,normal,par.perpTol))return null;
   const points=P.rect(center,view,par.width,par.depth);
   if((par.backClear>0&&!P.polyInsideBoundary(P.rearStrip({center,view,width:par.width,depth:par.depth},par.backClear),boundary))||!P.polyInsideBoundary(points,boundary)||!P.groundDrop(dropField,center,view,par.depth,par.width).ok)return null;
   return {center:center.slice(),view:view.slice(),points,width:par.width,depth:par.depth,active:true};
  }
  function at(x,y){
   const face=field.facing(x,y);if(!face)return [];
   return [0,-par.perpTol/2,par.perpTol/2].map(a=>candidate([x,y],P.rotate(face.downhill,a*Math.PI/180))).filter(Boolean);
  }
  progress({message:'Building a valid starting population…'});
  // Recompute from the current accepted terrain/settings, never a stale saved population.
  const baseline=P.generateLayout({boundary},{...opts,arrangement:'parallel',smoothed:lines,terrainLines:terrain});
  const seedUnits=[];
  for(const u of baseline.units||[]){const v=candidate(u.center,u.view);if(v&&P.validate({units:seedUnits.concat(v)},boundary,par).ok)seedUnits.push(v);}
  const candidates=[],g=graph(candidates,par);g.append(seedUnits);
  let best=seedUnits.map((_,i)=>i);
  const xs=boundary.map(p=>p[0]),ys=boundary.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  // Fixed budget in geometry space, independent of row guides. Coarsen unusually large sites.
  const step=Math.max(5,Math.sqrt((x1-x0)*(y1-y0)/2400));
  for(let x=x0+step/2;x<x1;x+=step){
   const batch=[];for(let y=y0+step/2;y<y1;y+=step)if(P.pointInPoly([x,y],boundary))batch.push(...at(x,y));
   g.append(batch);progress({message:'Checking possible villa positions…',candidates:candidates.length,best:best.length});
  }
  progress({message:'Selecting compatible placements…',candidates:candidates.length,best:best.length});
  best=improve(candidates,g.edges,best,rand,count=>progress({message:'Rearranging nearby villas…',best:count,candidates:candidates.length}));
  for(let pass=0;pass<2;pass++){
   const additions=[];
   for(const i of best){const c=candidates[i].center;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]])additions.push(...at(c[0]+dx*(pass?1.25:2.5),c[1]+dy*(pass?1.25:2.5)));
   }
   g.append(additions);progress({message:'Refining positions and replacing small groups…',best:best.length,candidates:candidates.length});
   best=improve(candidates,g.edges,best,rand,count=>progress({message:'Found a denser valid combination…',best:count,candidates:candidates.length}));
  }
  let units=best.map((i,k)=>{const u=candidates[i];return {id:'V'+String(k+1).padStart(3,'0'),name:'V'+String(k+1).padStart(3,'0'),center:u.center,view:u.view,points:u.points,width:par.width,depth:par.depth,active:true};});
  const validation=P.validate({units},boundary,par);
  // Independent final geometry gate; do not publish a graph-only acceptance claim.
  if(!validation.ok)return {ok:false,error:'Optimized arrangement failed independent validation',units:[],validation};
  const measured=P.metrics({units},boundary,field,par,{validation});
  const metrics={count:units.length,violations:validation.issues.length,issues:validation.issues,orientation:measured.orientation};
  return {ok:units.length>0,error:units.length?null:'No feasible villa placements found',units,params:par,metrics,validation,rows:undefined,
   search:{method:'candidate-conflict graph + neighbourhood replacement',provenOptimal:false,seed,gridStep:step,candidates:candidates.length,conflicts:g.pairs,evaluated,baseline:seedUnits.length,passes:3},elapsedMs:Date.now()-start};
 }
 return {generate,graph,greedy,improve};
})();
if(typeof module!=='undefined')module.exports=OptimizedPopulation;
