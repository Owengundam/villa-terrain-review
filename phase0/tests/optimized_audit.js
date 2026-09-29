/* Independent output audit: Clipper boundary/overlap, independently reconstructed
 * rectangles and vertex-to-edge clearance. No placement-time acceptance calls. */
const assert=require('node:assert/strict'),Clipper=require('clipper-lib');
function rectangle(c,v,w,d){const s=[v[1],-v[0]];return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[c[0]+a*w/2*s[0]+b*d/2*v[0],c[1]+a*w/2*s[1]+b*d/2*v[1]]);}
function booleanArea(a,b,type){const c=new Clipper.Clipper(),paths=new Clipper.Paths(),convert=p=>p.map(q=>({X:Math.round(q[0]*1e5),Y:Math.round(q[1]*1e5)}));c.AddPath(convert(a),Clipper.PolyType.ptSubject,true);c.AddPath(convert(b),Clipper.PolyType.ptClip,true);c.Execute(type,paths,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);return Math.abs(paths.reduce((sum,p)=>sum+Clipper.Clipper.Area(p),0))/1e10;}
function edgeDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function gap(a,b){let d=Infinity;for(const [p,q] of [[a,b],[b,a]])for(const v of p)for(let i=0;i<q.length;i++)d=Math.min(d,edgeDistance(v,q[i],q[(i+1)%q.length]));return d;}
function audit(result,boundary){
 const p=result.params,units=result.units,polys=units.map(u=>rectangle(u.center,u.view,p.width,p.depth));
 assert.equal(new Set(units.map(u=>u.id)).size,units.length);
 for(let i=0;i<units.length;i++){
  assert(Math.abs(Math.hypot(...units[i].view)-1)<1e-8);
  assert(booleanArea(polys[i],boundary,Clipper.ClipType.ctDifference)<1e-4,'footprint outside site');
  for(let j=i+1;j<units.length;j++){
   assert(booleanArea(polys[i],polys[j],Clipper.ClipType.ctIntersection)<1e-5,'overlap');
   assert(gap(polys[i],polys[j])>p.sideGap-1e-7,'side clearance');
  }
  if(p.backClear>0){const u=units[i],c=u.center.map((x,k)=>x-u.view[k]*(p.depth+p.backClear)/2),strip=rectangle(c,u.view,p.width,p.backClear);
   assert(booleanArea(strip,boundary,Clipper.ClipType.ctDifference)<1e-4,'rear strip outside site');
   for(let j=0;j<units.length;j++)if(i!==j)assert(booleanArea(strip,polys[j],Clipper.ClipType.ctIntersection)<1e-4,'rear strip intrusion');
  }
 }
 return {count:units.length,boundary:true,overlap:true,sideClearance:true,rearStrips:true,uniqueIds:true};
}
module.exports=audit;
