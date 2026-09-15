/* Fixed geometry; manual activation never silently deletes or moves a villa. */
const ReductionModel = (() => {
  const half=Math.PI/12, allowed=Math.PI/20;
  function union(intervals){let end=-Infinity,total=0;for(const [a,b] of intervals.slice().sort((a,b)=>a[0]-b[0])){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;}
  function coverage(layout,active,z){return layout.spans.map((row,i)=>active[i]?union(row.filter(([j])=>active[j]&&z[i]-z[j]<5.25-1e-6).map(([,a,b])=>[a,b])):0);}
  function heights(ref,edges,active,limit=1.5){
    const low=ref.map(x=>x-limit),high=ref.map(x=>x+limit),lo=low.slice();let changed=false;
    for(let k=0;k<ref.length;k++){changed=false;for(const [a,b] of edges){const need=lo[b]+5.251;if(need>lo[a]+1e-8){lo[a]=need;changed=true;}}if(!changed)break;}
    const feasible=!changed&&lo.every((x,i)=>!active[i]||x<=high[i]+1e-7);let z=ref.slice();
    if(feasible){const dual=edges.map(()=>0),box=ref.map(()=>0);for(let k=0;k<180;k++){
      edges.forEach(([a,b],e)=>{const ya=z[a]-dual[e],yb=z[b]+dual[e],lam=Math.max(0,(5.251-ya+yb)/2);z[a]=ya+lam;z[b]=yb-lam;dual[e]=lam;});
      z=z.map((x,i)=>{const y=x+box[i],q=Math.max(low[i],Math.min(high[i],y));box[i]=y-q;return q;});
    }if(edges.some(([a,b])=>z[a]-z[b]<5.251-1e-6))z=lo.map((x,i)=>active[i]?x:ref[i]);
    }
    return {z,feasible};
  }
  function inspect(layout,active,z,limit=1.5){
    const covered=coverage(layout,active,z),viewBad=covered.map((c,i)=>active[i]&&c>allowed+1e-9),conflicts=layout.conflicts.filter(([a,b])=>active[a]&&active[b]),outside=layout.outside.filter(i=>active[i]);
    const padBad=z.map((x,i)=>active[i]&&(!Number.isFinite(x)||Math.abs(x-layout.units[i].reference)>limit+1e-6));
    return {z,covered,viewBad,padBad,conflicts,outside,valid:!viewBad.some(Boolean)&&!padBad.some(Boolean)&&!conflicts.length&&!outside.length};
  }
  function solve(layout,active,seed=null,limit=1.5){
    const ref=layout.units.map(u=>u.reference),edges=[],edgeSet=new Set();let z=(seed||ref).map((x,i)=>active[i]?Math.max(ref[i]-limit,Math.min(ref[i]+limit,x)):ref[i]);
    function rank(values){const c=coverage(layout,active,values);return [c.filter(x=>x>allowed+1e-9).length,c.reduce((s,x)=>s+Math.max(0,x-allowed),0),c.reduce((s,x)=>s+x,0),layout.spans.reduce((s,row,i)=>s+(active[i]?row.reduce((v,[j,a,b])=>v+(active[j]&&values[i]-values[j]<5.25-1e-6?b-a:0),0):0),0),values.reduce((s,x,i)=>s+(x-ref[i])**2,0)];}
    function less(a,b){for(let i=0;i<a.length;i++){if(a[i]<b[i]-1e-10)return true;if(a[i]>b[i]+1e-10)return false;}return false;}
    for(let k=0;k<=ref.length;k++){
      const c=coverage(layout,active,z);if(Math.max(...c)<=allowed+1e-9)break;
      // Lock currently cleared angular relationships; an unrelated view cannot regress.
      layout.spans.forEach((row,i)=>{if(!active[i])return;for(const [j] of row){const key=i+':'+j;if(active[j]&&z[i]-z[j]>=5.25-1e-6&&!edgeSet.has(key)){edgeSet.add(key);edges.push([i,j]);}}});
      const baseline=rank(z);let best=null;
      layout.spans.forEach((row,i)=>{if(!active[i]||c[i]<=allowed+1e-9)return;for(const [j] of row){if(!active[j]||edgeSet.has(i+':'+j))continue;const h=heights(ref,edges.concat([[i,j]]),active,limit);if(!h.feasible)continue;const key=rank(h.z);if(less(key,baseline)&&(!best||less(key,best.key)))best={key,z:h.z,i,j};}});
      if(!best)break;z=best.z;edges.push([best.i,best.j]);edgeSet.add(best.i+':'+best.j);
    }
    return inspect(layout,active,z,limit);
  }
  return {union,coverage,solve,inspect};
})();
if(typeof module!=='undefined')module.exports=ReductionModel;
