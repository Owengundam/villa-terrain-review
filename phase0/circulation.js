/* Fixed-layout circulation study. Metres in/out; Clipper uses millimetres.
 * No building edits, terrain grading, or vehicle usability claims.
 * Only active footprints obstruct roads. Search is bounded and deterministic.
 */
const Circulation=(()=>{
 'use strict';
 const C=typeof module!=='undefined'&&module.exports?require('clipper-lib'):ClipperLib;
 const P=typeof module!=='undefined'&&module.exports?require('./parallel_para.js'):ParallelPara;
 const Terrain=typeof module!=='undefined'&&module.exports?require('./road_terrain.js'):RoadTerrain;
 const SCALE=1000, TOL=0.00001;
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const length=p=>p.slice(1).reduce((n,b,i)=>n+dist(p[i],b),0);
 const path=p=>p.map(q=>({X:Math.round(q[0]*SCALE),Y:Math.round(q[1]*SCALE)}));
 const unpath=p=>p.map(q=>[q.X/SCALE,q.Y/SCALE]);
 function ring(p){const r=path(p);if(!C.Clipper.Orientation(r))r.reverse();return r;}
 function op(a,b,type){const c=new C.Clipper(),out=[];c.AddPaths(a,C.PolyType.ptSubject,true);if(b.length)c.AddPaths(b,C.PolyType.ptClip,true);c.Execute(type,out,C.PolyFillType.pftNonZero,C.PolyFillType.pftNonZero);return out;}
 const union=a=>op(a,[],C.ClipType.ctUnion);
 const area=a=>Math.abs(a.reduce((s,p)=>s+C.Clipper.Area(p),0))/SCALE**2;
 function buffer(points,r,flat=false){
  points=points.filter((p,i)=>!i||dist(p,points[i-1])>1e-9);
  if(points.length===1){const p=points[0];return [ring(Array.from({length:32},(_,i)=>[p[0]+r*Math.cos(i*Math.PI/16),p[1]+r*Math.sin(i*Math.PI/16)]))];}
  const off=new C.ClipperOffset(2,0.005*SCALE),out=[];
  off.AddPath(path(points),C.JoinType.jtRound,flat?C.EndType.etOpenButt:C.EndType.etOpenRound);off.Execute(out,r*SCALE);return out;
 }
 // Independent millimetre rounding of strip vertices, centreline and offset ends
 // can produce sub-millimetre slivers at an exactly shared rear boundary.
 // Allow only 2 mm of positional error here; site/building checks stay unchanged.
 function entranceWithinStrip(envelope,strip){
  const off=new C.ClipperOffset(2,0.25),expanded=[];
  off.AddPaths(strip,C.JoinType.jtMiter,C.EndType.etClosedPolygon);off.Execute(expanded,2);
  return area(op(envelope,expanded,C.ClipType.ctDifference))<=TOL;
 }
 function settings(input={}){
  const number=(k,def,min,max,unit='m')=>{const raw=input[k]===undefined?def:input[k];if(raw===null||raw===''||!Number.isFinite(Number(raw))||Number(raw)<min||Number(raw)>max)throw Error('Enter a valid '+k+' ('+min+'–'+max+' '+unit+').');return Number(raw);};
  return {checkSlope:input.checkSlope!==false,width:number('width',undefined,0.5,12),edge:number('edge',0,0,3),backClear:number('backClear',7,0,30),entranceWidth:number('entranceWidth',1.5,0.5,5),cell:number('cell',2,1,5),maxSlope:number('maxSlope',8,0,100,'%')};
 }
 const isActive=(input,u,i)=>input.active?input.active[i]!==false:u.active!==false;
 const activeUnits=input=>input.layout.units.filter((u,i)=>isActive(input,u,i));
 // A continuous shared reference for routing, profiles and final validation.
 function terrainReference(contours){return Terrain.reference(contours);}
 function assessment(points,terrain,s){return s.checkSlope?profile(points,terrain,s.maxSlope):{ok:true,evaluated:false,maxSlope:null,samples:[]};}
 function profile(points,terrain,maxSlope,step=0.5){
  const samples=[];let station=0,max=0;
  const read=(p,s)=>{const z=terrain.zAt(p[0],p[1]);samples.push({s,x:p[0],y:p[1],z});return z;};
  let prev=read(points[0],0);
  if(prev===null||!Number.isFinite(prev))return {ok:false,reason:'Reference terrain unresolved',maxSlope:null,samples};
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=dist(a,b);if(len<1e-9)continue;const count=Math.ceil(len/step),ds=len/count;
   for(let j=1;j<=count;j++){const t=j/count,z=read([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],station+j*ds);
    if(z===null||!Number.isFinite(z))return {ok:false,reason:'Reference terrain unresolved',maxSlope:null,samples};
    const grade=100*Math.abs(z-prev)/ds;max=Math.max(max,grade);prev=z;
   }station+=len;
  }
  return {ok:max<=maxSlope+1e-7,reason:max>maxSlope+1e-7?'Road slope '+max.toFixed(2)+'% exceeds '+maxSlope+'%':null,maxSlope:max,sampleStep:step,samples};
 }
 function fingerprint(input){return JSON.stringify({layout:input.layout,boundary:input.boundary,contours:input.contours,active:input.active,z:input.z,entrance:input.entrance,settings:input.settings,guidance:input.guidance});}
 function environment(boundary,units){
  const site=[ring(boundary)],obstacles=units.map(u=>({id:u.id,poly:ring(u.points)}));
  function check(poly,ignore){
   if(!poly.length)return {ok:false,reason:'Empty road footprint'};
   if(area(op(poly,site,C.ClipType.ctDifference))>TOL)return {ok:false,reason:'Road width leaves the site'};
   const hits=obstacles.filter(o=>o.id!==ignore&&area(op(poly,[o.poly],C.ClipType.ctIntersection))>TOL).map(o=>o.id);
   return hits.length?{ok:false,reason:'Blocked by '+hits.join(', '),hits}:{ok:true};
  }
  return {site,obstacles,check};
 }
 function rear(u){const d=(u.depth||23)/2;return [u.center[0]-d*u.view[0],u.center[1]-d*u.view[1]];}
 function portal(u,d){const r=rear(u);return [r[0]-d*u.view[0],r[1]-d*u.view[1]];}
 // Binary heap for bounded A*. Stable numeric tie-break keeps identical inputs repeatable.
 class Heap{
  constructor(){this.a=[];}
  push(x){const a=this.a;a.push(x);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<x.f||(a[p].f===x.f&&a[p].id<=x.id))break;a[i]=a[p];i=p;}a[i]=x;}
  pop(){const a=this.a,r=a[0],x=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let k=i*2+1;if(k+1<a.length&&(a[k+1].f<a[k].f||(a[k+1].f===a[k].f&&a[k+1].id<a[k].id)))k++;if(a[k].f>x.f||(a[k].f===x.f&&a[k].id>=x.id))break;a[i]=a[k];i=k;}a[i]=x;}return r;}
 }
 function router(boundary,units,radius,cell,gradeOK=()=>true){
  const xs=boundary.map(p=>p[0]),ys=boundary.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys);
  const nx=Math.ceil((Math.max(...xs)-x0)/cell)+1,ny=Math.ceil((Math.max(...ys)-y0)/cell)+1;
  if(nx*ny>250000)throw Error('Site exceeds the bounded routing grid; increase grid spacing.');
  const cache=new Int8Array(nx*ny),polys=units.map(u=>u.points),edges=[];
  for(const poly of [boundary,...polys])for(let i=0;i<poly.length;i++)edges.push([poly[i],poly[(i+1)%poly.length]]);
  const point=id=>[x0+(id%nx)*cell,y0+Math.floor(id/nx)*cell];
  const pointOK=p=>P.pointInPoly(p,boundary)&&P.ptPolyDist(p,boundary)>radius+0.01&&!polys.some(poly=>P.pointInPoly(p,poly)||P.ptPolyDist(p,poly)<radius+0.01);
  const valid=id=>{if(!cache[id])cache[id]=pointOK(point(id))?1:-1;return cache[id]===1;};
  const edgeCache=new Map();
  function edgeCheck(a,b){
   if(!pointOK(a)||!pointOK(b))return false;
   for(const [c,d] of edges){if(P.segCross(a,b,c,d))return false;
    if(Math.min(P.segDist(a,c,d),P.segDist(b,c,d),P.segDist(c,a,b),P.segDist(d,a,b))<radius+0.005)return false;}
   return gradeOK([a,b]);
  }
  function edgeOK(a,b){const ka=a.join(','),kb=b.join(','),key=ka<kb?ka+'|'+kb:kb+'|'+ka;if(!edgeCache.has(key))edgeCache.set(key,edgeCheck(a,b));return edgeCache.get(key);}
  function near(p){const ix=Math.round((p[0]-x0)/cell),iy=Math.round((p[1]-y0)/cell),out=[];
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=ix+dx,y=iy+dy,id=y*nx+x;if(x>=0&&x<nx&&y>=0&&y<ny&&valid(id)&&edgeOK(p,point(id)))out.push(id);}
   return out.sort((a,b)=>dist(p,point(a))-dist(p,point(b))||a-b).slice(0,6);
  }
  function route(a,b){
   if(edgeOK(a,b))return [a,b];
   const starts=near(a),ends=new Set(near(b));if(!starts.length||!ends.size)return null;
   const heap=new Heap(),cost=new Float64Array(nx*ny).fill(Infinity),parent=new Int32Array(nx*ny).fill(-1),closed=new Uint8Array(nx*ny);
   for(const id of starts){cost[id]=dist(a,point(id));heap.push({id,f:cost[id]+dist(point(id),b)});}
   let found=-1,expanded=0;
   while(heap.a.length&&expanded++<30000){const {id}=heap.pop();if(closed[id])continue;closed[id]=1;if(ends.has(id)){found=id;break;}
    const x=id%nx,y=Math.floor(id/nx),p=point(id);
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]]){const xx=x+dx,yy=y+dy,n=yy*nx+xx;
     if(xx<0||xx>=nx||yy<0||yy>=ny||closed[n]||!valid(n))continue;
     const q=point(n),g=cost[id]+dist(p,q);if(g>=cost[n]||!edgeOK(p,q))continue;cost[n]=g;parent[n]=id;heap.push({id:n,f:g+dist(q,b)});}
   }
   if(found<0)return null;
   const rev=[b];for(let id=found;id>=0;id=parent[id])rev.push(point(id));rev.push(a);rev.reverse();
   // Visibility shortening stays in swept-width free space; no unconstrained spline.
   const out=[rev[0]];let i=0;while(i<rev.length-1){let j=rev.length-1;while(j>i+1&&!edgeOK(rev[i],rev[j]))j--;out.push(rev[j]);i=j;}return out;
  }
  return {route};
 }
 function generate(input,progress=()=>{}){
  const s=settings(input.settings),layout=input.layout,units=layout.units;
  if(!Array.isArray(input.boundary)||input.boundary.length<3)throw Error('Site boundary is missing.');
  if(!units.length)throw Error('No villas to serve.');
  if(units.some(u=>!u.row))throw Error('This arrangement has no row IDs. Populate a parallel or staggered arrangement first.');
  const obstacles=activeUnits(input),env=environment(input.boundary,obstacles),radius=s.width/2+s.edge;
  const terrain=s.checkSlope?terrainReference(input.contours):null,gradeOK=line=>assessment(line,terrain,s).ok;
  if(2*radius>s.backClear)throw Error('Road width plus edge allowances exceeds the rear reservation.');
  const nodes=[],roads=[],warnings=[],reservations=[],byId=new Map(),groups=new Map();
  const enabled=units.map((u,i)=>isActive(input,u,i));
  const addRoad=(kind,a,b,points,width=s.width)=>{
   const footprint=buffer(points,width/2,kind==='entrance'),envelope=buffer(points,width/2+(kind==='entrance'?0:s.edge),kind==='entrance');
   const slope=assessment(points,terrain,s);
   if(!slope.ok)throw Error(slope.reason);
   const r={id:'road-'+roads.length,kind,a,b,points,width,footprint:footprint.map(unpath),envelope:envelope.map(unpath),length:length(points),profile:slope};roads.push(r);return r;
  };
  units.forEach((u,i)=>{
   if(!enabled[i])return;
   const strip=P.rearStrip(u,s.backClear),r=rear(u);reservations.push({villa:u.id,polygons:op([ring(strip)],env.site,C.ClipType.ctIntersection).map(unpath)});
   const candidates=[s.backClear/2,radius+0.025,s.backClear-radius-0.025].filter(d=>d>=radius&&d<=s.backClear-radius);
   let selected=null,last='No usable road width in rear reservation';
   for(const d of [...new Set(candidates)]){const p=portal(u,d),disc=buffer([p],radius),check=env.check(disc);
    if(!check.ok){last=check.reason;continue;}
    if(area(op(disc,[ring(strip)],C.ClipType.ctDifference))>TOL){last='Rear reservation too narrow';continue;}
    const arrival=buffer([p,r],s.entranceWidth/2,true),ec=env.check(arrival,u.id);
    if(!ec.ok||!entranceWithinStrip(arrival,[ring(strip)])){last=ec.reason||'Entrance connection leaves rear reservation';continue;}
    const slope=assessment([p,r],terrain,s);if(!slope.ok){last=slope.reason;continue;}
    selected={id:u.id,point:p,rear:r,row:u.row,order:u.order,connected:false};break;
   }
   if(!selected){warnings.push({villa:u.id,reason:last});return;}
   nodes.push(selected);byId.set(u.id,selected);if(!groups.has(u.row))groups.set(u.row,[]);groups.get(u.row).push(selected);
   addRoad('arrival',selected.id,selected.id,[selected.point]);addRoad('entrance',selected.id,selected.id,[selected.point,r],s.entranceWidth);
  });
  // Edges link only explicit portals. XY crossings are not silently declared junctions.
  for(const [row,members] of groups){members.sort((a,b)=>a.order-b.order);
   for(let i=1;i<members.length;i++){const a=members[i-1],b=members[i],line=[a.point,b.point],check=env.check(buffer(line,radius));
    const slope=assessment(line,terrain,s);
    if(check.ok&&slope.ok)addRoad('row',a.id,b.id,line);else warnings.push({row,a:a.id,b:b.id,reason:'Direct row link: '+(check.reason||slope.reason)});}
  }
  const adjacency=()=>{const m=new Map(nodes.map(n=>[n.id,[]]));if(input.entrance)m.set('site',[]);
   for(const r of roads)if(r.a!==r.b){m.get(r.a)?.push([r.b,r.id]);m.get(r.b)?.push([r.a,r.id]);}return m;};
  function reachable(){const adj=adjacency(),seen=new Set(['site']),parents={},queue=['site'];for(let i=0;i<queue.length;i++)for(const [b,r] of adj.get(queue[i])||[])if(!seen.has(b)){seen.add(b);parents[b]=[queue[i],r];queue.push(b);}return {seen,parents};}
  let searchAttempts=0;
  if(input.entrance){
   if(!Array.isArray(input.entrance)||input.entrance.length!==2||!input.entrance.every(Number.isFinite))throw Error('Invalid site entrance.');
   if(!env.check(buffer([input.entrance],radius)).ok)throw Error('Choose an interior entrance arrival point with space for the full road width. External gate tie-in is not checked in this version.');
   if(!gradeOK([input.entrance]))throw Error('Reference terrain at the entrance is unresolved; select a point within supported contour levels.');
   const route=router(input.boundary,obstacles,radius,s.cell,gradeOK);
   for(let step=0;step<nodes.length;step++){
    const {seen}=reachable(),remaining=nodes.filter(n=>!seen.has(n.id));if(!remaining.length)break;
    progress({stage:'Connecting rear lanes',completed:nodes.length-remaining.length,total:nodes.length});
    const connected=[{id:'site',point:input.entrance},...nodes.filter(n=>seen.has(n.id))],pairs=[];
    for(const a of connected)for(const b of remaining)pairs.push({a,b,d:dist(a.point,b.point)});
    pairs.sort((a,b)=>a.d-b.d||a.a.id.localeCompare(b.a.id)||a.b.id.localeCompare(b.b.id));
    let best=null;
    for(let candidate=0;candidate<pairs.length;candidate++){if(candidate>0&&candidate%12===0&&best)break;const pair=pairs[candidate];searchAttempts++;const line=route.route(pair.a.point,pair.b.point);if(!line)continue;
     if(!env.check(buffer(line,radius)).ok)continue;const len=length(line);if(!best||len<best.len)best={...pair,line,len};}
    if(!best)break;addRoad('connector',best.a.id,best.b.id,best.line);
   }
  }
  const {seen,parents}=reachable();
  const served=units.filter((u,i)=>enabled[i]).map(u=>{const node=byId.get(u.id),connected=!!input.entrance&&seen.has(u.id),route=[];
   if(connected){let id=u.id;while(id!=='site'){const p=parents[id];if(!p)break;route.push(p[1]);id=p[0];}}
   return {id:u.id,connected,status:connected?(s.checkSlope?'Connected in plan; road slope checked':'Connected in plan; slope unchecked'):!input.entrance?'Reservation only':'Unresolved',reason:connected?(s.checkSlope?'Ground-following slope within '+s.maxSlope+'%; entrance levels and vehicle turns not evaluated':'Slope checking disabled; terrain/access not validated'):warnings.find(w=>w.villa===u.id)?.reason||(!input.entrance?'Set an entrance arrival point':(s.checkSlope?'No width- and slope-compliant connection found within the bounded search':'No width-compliant connection found within the bounded search')),route,rear:node?.rear};});
  const unionFootprints=union(roads.flatMap(r=>r.footprint.map(ring)));
  const ghostCrossings=units.filter((u,i)=>!enabled[i]).map(u=>({villa:u.id,roads:roads.filter(r=>area(op(r.envelope.map(ring),[ring(u.points)],C.ClipType.ctIntersection))>TOL).map(r=>r.id)})).filter(g=>g.roads.length);
  const result={version:3,settings:s,entrance:input.entrance||null,nodes,roads,reservations,warnings,served,ghostCrossings,connected:served.filter(v=>v.connected).length,total:served.length,length:roads.filter(r=>r.kind!=='arrival'&&r.kind!=='entrance').reduce((n,r)=>n+r.length,0),area:area(unionFootprints),searchAttempts,terrain:!s.checkSlope?'Slope checking disabled':roads.length?'Sampled longitudinal slope checked':'No accepted roads',slope:{enabled:s.checkSlope,limit:s.maxSlope,maxObserved:s.checkSlope&&roads.length?Math.max(...roads.map(r=>r.profile.maxSlope)):null,sampleStep:0.5,source:terrain?terrain.source:null},vehicle:'Not evaluated',gateTieIn:'Not evaluated',fingerprint:fingerprint(input)};
  const check=validate(result,input);if(!check.ok)throw Error('Independent road check failed: '+check.issues.join('; '));result.validation=check;return result;
 }
 function validate(result,input){
  const s=settings(input.settings),env=environment(input.boundary,activeUnits(input)),terrain=s.checkSlope?terrainReference(input.contours):null,issues=[],ids=new Set(result.nodes.map(n=>n.id));ids.add('site');
  const graph=new Map([...ids].map(id=>[id,[]]));
  for(const n of result.nodes){
   const u=input.layout.units.find(u=>u.id===n.id),entry=result.roads.find(r=>r.kind==='entrance'&&r.a===n.id);
   if(!u||!entry||dist(entry.points[0],n.point)>0.002||dist(entry.points.at(-1),rear(u))>0.002){issues.push(n.id+': missing or disconnected rear entrance link');continue;}
   const strip=[ring(P.rearStrip(u,result.settings.backClear))];
   if(!entranceWithinStrip(buffer(entry.points,entry.width/2,true),strip))issues.push(n.id+': entrance link leaves rear reservation');
   if(area(op(buffer([n.point],result.settings.width/2+result.settings.edge),strip,C.ClipType.ctDifference))>TOL)issues.push(n.id+': arrival width leaves rear reservation');
  }
  for(const r of result.roads){const envelope=buffer(r.points,r.width/2+(r.kind==='entrance'?0:result.settings.edge),r.kind==='entrance');
   if(r.width!==(r.kind==='entrance'?result.settings.entranceWidth:result.settings.width))issues.push(r.id+': inconsistent width');
   const c=env.check(envelope,r.kind==='entrance'?r.a:undefined);if(!c.ok)issues.push(r.id+': '+c.reason);
   const slope=assessment(r.points,terrain,s);if(!slope.ok)issues.push(r.id+': '+slope.reason);
   if(!ids.has(r.a)||!ids.has(r.b))issues.push(r.id+': unknown endpoint');
   if(r.a!==r.b){const a=r.a==='site'?result.entrance:result.nodes.find(n=>n.id===r.a)?.point,b=result.nodes.find(n=>n.id===r.b)?.point;
    if(!a||!b||dist(r.points[0],a)>0.002||dist(r.points.at(-1),b)>0.002)issues.push(r.id+': disconnected geometry');
    graph.get(r.a)?.push(r.b);graph.get(r.b)?.push(r.a);}
  }
  const reached=new Set(result.entrance?['site']:[]),q=[...reached];for(let i=0;i<q.length;i++)for(const id of graph.get(q[i])||[])if(!reached.has(id)){reached.add(id);q.push(id);}
  for(const v of result.served)if(v.connected!==reached.has(v.id))issues.push(v.id+': inconsistent connectivity');
  return {ok:!issues.length,issues};
 }
 return {entranceWithinStrip,settings,fingerprint,generate,validate,buffer,environment,area,ring,op,union,unpath,rear,router,terrainReference,profile,activeUnits};
})();
if(typeof module!=='undefined')module.exports=Circulation;
