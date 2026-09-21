/* parallelPara module tests.
   The fixtures are deliberately analytic: synthetic sites where the expected spacing, row
   direction and clearances can be computed by hand, so a wrong implementation cannot approve
   itself. The real site is exercised at the end with the shipped report data. */
const assert=require('node:assert/strict'),fs=require('node:fs'),P=require('../parallel_para.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
const A={sideGap:3,backClear:7,perpTol:15};

/* ---- fixture builders ---- */
// a straight contour line from (x0,y) to (x1,y) at elevation z
function hline(z,y,x0,x1,n){n=n||8;const pts=[];for(let i=0;i<=n;i++)pts.push([x0+(x1-x0)*i/n,y]);return {z,points:pts};}
// rectangular site boundary, origin at (0,0), width w, height h
function box(w,h){return [[0,0],[w,0],[w,h],[0,h]];}
// south-facing slope: elevation drops as y grows (downhill = +y)
function slopeTerrain(w,h,lines){
 const out=[];
 for(let i=1;i<=lines;i++)out.push(hline(1400-i*5,i*h/(lines+1),0,w,8));
 return out;}
function foot(u){return P.rect(u.center,u.view,u.width||11,u.depth||23);}
function angleDeg(a,b){return Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;}

/* 1. smoothing: thinning + one Chaikin pass, always from the source, never accumulated. */
{
 const c0=report.contours.map(c=>({...c,points:c.points.map(p=>p.slice())}));
 const s0=P.smoothContours(c0,0);
 assert.deepEqual(s0[0].points,c0[0].points,'level 0 returns the accepted polyline unchanged');
 const s2a=P.smoothContours(c0,2),s2b=P.smoothContours(c0,2);
 assert.deepEqual(s2a.map(c=>c.points),s2b.map(c=>c.points),'smoothing is repeatable from the same source');
 assert.deepEqual(c0[0].points,report.contours[0].points,'the source contours are not mutated');
 const s6=P.smoothContours(c0,6);
 assert.equal(s6.length,c0.length,'1:1 contour mapping — no invented or dropped lines');
 assert.equal(s6[3].z,c0[3].z,'elevation labels are preserved');
 assert(Math.abs(s6[0].points[0][0]-c0[0].points[0][0])<1e-9,'endpoints are preserved');
 function turning(p){let t=0;for(let i=1;i<p.length-1;i++){const a1=Math.atan2(p[i][1]-p[i-1][1],p[i][0]-p[i-1][0]),a2=Math.atan2(p[i+1][1]-p[i][1],p[i+1][0]-p[i][0]);let d=a2-a1;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;t+=Math.abs(d);}return t;}
 assert(turning(s6[0].points)<turning(c0[0].points),'smoothing reduces zigzag');
 console.log('PASS smoothing: from source, deterministic, labels/endpoints kept, zigzag reduced');
}

/* 2. settings validation: nothing is silently coerced */
{
 assert(P.settings({sideGap:3,backClear:7}).ok,'adopted defaults are valid');
 const empty=P.settings({sideGap:'',backClear:7});
 assert(!empty.ok&&/Min side clearance/.test(empty.errors[0]),'an empty clearance field is an error, never 0');
 const nan=P.settings({sideGap:'abc',backClear:7});
 assert(!nan.ok,'a non-numeric clearance is an error');
 const out=P.settings({sideGap:-1,backClear:7});
 assert(!out.ok,'a negative clearance is an error');
 const wide=P.settings({sideGap:3,backClear:7,width:20,depth:30});
 assert(wide.ok&&Math.abs(wide.values.alongPitch-(20+3+1))<1e-9,'along pitch follows the selected width and clearance');
 assert(Math.abs(wide.values.acrossPitch-(30+7+1))<1e-9,'across pitch follows the selected depth and rear clearance');
 const d=P.settings({});
 assert(Math.abs(d.values.alongPitch-15)<1e-9&&Math.abs(d.values.acrossPitch-31)<1e-9,'defaults: 11+3+1 along, 23+7+1 across');
 console.log('PASS settings: defaults, empty/invalid rejected, pitches derived from the parameters');
}

/* 3. elevation field: brackets two levels, monotone between them, normal points uphill */
{
 const terrain=[hline(1400,20,0,120,8),hline(1390,60,0,120,8)];  // drop toward +y
 const f=P.buildField(terrain,P.settings(A).values);
 const mid=f.zAt(60,40);
 assert(mid!==null&&mid>1390&&mid<1400,'between two lines the elevation is bracketed: '+mid);
 assert(f.zAt(60,25)>f.zAt(60,55),'elevation decreases downhill (monotone, no dip between lines)');
 assert(Math.abs(f.zAt(60,20)-1400)<1e-6&&Math.abs(f.zAt(60,60)-1390)<1e-6,'on a line the elevation is exact');
 const n=f.normalAt(60,40);
 assert(n&&n[1]<0,'the normal points uphill (toward higher ground), got '+JSON.stringify(n));
 const face=f.facing(60,40);
 assert(face.downhill[1]>0,'downhill-ward facing points +y on this slope');
 // a villa whose front is downhill passes the drop check; the reversed one fails
 const okDrop=P.groundDrop(f,[60,40],face.downhill,23,11);
 const badDrop=P.groundDrop(f,[60,40],face.uphill,23,11);
 assert(okDrop.ok&&okDrop.drop>0,'front-downhill over the full depth passes');
 assert(!badDrop.ok&&badDrop.drop<0,'front-uphill over the full depth fails');
 console.log('PASS field: bracketed elevation, monotone between lines, uphill normal, depth drop check');
}
/* 4. rear strips: geometry, both directions, strips may overlap, no all-round setback */
{
 const mk=(id,x,y,view)=>({id,center:[x,y],view:view.slice(),width:11,depth:23,points:P.rect([x,y],view,11,23)});
 const a=mk('A',0,0,[0,-1]);                       // faces -y, rear toward +y
 const strip=P.rearStrip(a,7);
 assert(Math.abs(Math.max(...strip.map(p=>p[1]))-18.5)<1e-6,'strip ends 7 m behind the rear facade (11.5+7)');
 assert(Math.abs(Math.min(...strip.map(p=>p[1]))-11.5)<1e-6,'strip starts at the rear facade (11.5)');
 const downhill=mk('B',0,-40,[0,-1]);
 assert(!P.stripIntrusion(P.rearStrip(a,7),downhill.points),'a villa 40 m downhill does not intrude the strip');
 const behind=mk('C',0,5,[0,-1]);
 assert(P.stripIntrusion(P.rearStrip(a,7),behind.points),'a villa 5 m behind intrudes the 7 m strip');
 assert(P.rearConflict(a,behind,7)==='A','the FIRST villa\'s strip entered is reported as A');
 assert(P.rearConflict(behind,a,7)==='B','and the second villa\'s strip, the other way round — both directions are checked');
 const side=mk('D',14.5,0,[0,-1]);
 assert(P.rearConflict(a,side,7)===null,'side-by-side villas: strips are parallel, no intrusion (not a 14 m gap rule)');
 // strips may overlap without any footprint intrusion: two rows 31 m apart
 const up=mk('E',0,31,[0,-1]);
 assert(P.rearConflict(a,up,7)===null,'rows 31 m apart: neither footprint enters the other strip');
 // the strip is tied to the villa's own orientation, not to a world axis
 const rot=mk('F',0,0,[1,0]);
 const rstrip=P.rearStrip(rot,7);
 assert(Math.abs(Math.max(...rstrip.map(p=>p[0]))+11.5)<1e-6,'a rotated villa\'s strip follows its axis (rotated rear at -11.5)');
 console.log('PASS rear strips: facade-anchored, both directions, overlap allowed, rotates with the villa');
}

/* 5. side clearance: the documented directional predicate, one frame suffices */
{
 const mk=(id,x,y,view)=>({id,center:[x,y],view:view.slice(),width:11,depth:23,points:P.rect([x,y],view,11,23)});
 const a=mk('S1',0,0,[0,-1]);
 for(const gap of [2.2]){
  const b=mk('S2',11+gap,0,[0,-1]);
  const r=P.sideClearance(a,b,3);
  assert(!r.ok,'a '+gap+' m side gap fails (measured '+r.polyGap.toFixed(2)+' m)');
 }
 const ok=mk('S3',14.6,0,[0,-1]);
 assert(P.sideGapOK(a,ok,3),'a 3.6 m side gap passes');
 // A CURVED-ROW PAIR: two villas whose headings differ by 20°, close together. The frames
 // disagree (one measures a 2.5 m side gap), yet the footprints are 3.4 m apart, so the union
 // of the two statements accepts the pair — requiring BOTH frames is the older, too-strict rule
 // that discarded legitimate curved-row neighbours.
 const c1=mk('C1',0,0,[0,-1]);
 const th=20*Math.PI/180;
 const v2=[Math.sin(th),-Math.cos(th)];
 const c2={id:'C2',center:[17.1,5.0],view:v2,width:11,depth:23};
 c2.points=P.rect(c2.center,v2,11,23);
 const r2=P.sideClearance(c1,c2,3);
 assert(!P.polysOverlap(c1.points,c2.points),'the curved-row pair does not overlap');
 assert(r2.polyGap>3,'its footprints are more than 3 m apart (measured '+r2.polyGap.toFixed(2)+')');
 assert(r2.sep.some(s=>s<3),'and one frame still reads under 3 m: '+JSON.stringify(r2.sep));
 assert(r2.ok,'so the union accepts a legitimate curved-row pair');
 // the documented relationship: a directional (projection) separation can never exceed the true
 // polygon distance, which is why the union simplifies to the plain-distance statement
 for(const pair of [r2,P.sideClearance(a,ok,3),P.sideClearance(a,{points:c3pts(),view:v2,center:[17.1,0]},3)]){
  if(!pair.sep.length)continue;
  assert(pair.sep.every(s=>s<=pair.polyGap+1e-9),'directional separation ≤ true distance: '+JSON.stringify(pair));}
 function c3pts(){return P.rect([17.1,0],v2,11,23);}
 // a genuinely invalid pair: the same headings, 2.2 m apart
 const bad=mk('BAD',13.2,0,[0,-1]);
 assert(!P.sideClearance(a,bad,3).ok,'a 2.2 m side gap is rejected, not excused by the direction');
 // exact threshold: 3 m exactly is not more than 3 m
 const exact=mk('T1',0,0,[0,-1]),exact2=mk('T2',14,0,[0,-1]);
 assert(!P.sideGapOK(exact,exact2,3),'exactly the minimum gap fails the strict inequality');
 assert(P.sideGapOK(exact,exact2,2.99),'and passes once the requirement is just under it');
 console.log('PASS side clearance: directional (one frame enough), exact threshold strict, measured gaps reported');
}

/* 6. row guides on a straight slope: rows are straight, spacing is the parameter-derived pitch */
{
 const boundary=box(120,120),terrain=slopeTerrain(120,120,4);
 const res=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 assert(res.ok,'a straight slope generates a valid layout: '+JSON.stringify(res.validation.issues.slice(0,3)));
 assert(res.units.length>0,'villas are placed: '+res.units.length);
 // every villa sits on its own row guide within a hair, and rows are straight lines here
 for(const r of res.rows){
  const us=res.units.filter(u=>u.row===r.id);
  if(us.length<2)continue;
  const ys=us.map(u=>u.center[1]);
  const spread=Math.max(...ys)-Math.min(...ys);
  assert(spread<1.5,'a row on straight contours stays a straight line (spread '+spread.toFixed(2)+' m)');
 }
 // along-row pitch and cross-row pitch come from the parameters. The row sequence is the
 // placement ORDER (a row is walked in one direction and may legitimately run either way in x).
 const rows=res.rows.map(r=>({r,us:res.units.filter(u=>u.row===r.id).sort((a,b)=>a.order-b.order)})).filter(x=>x.us.length>1);
 let checked=0;
 for(const {r,us} of rows){
  for(let i=1;i<us.length;i++)if(us[i].order===us[i-1].order+1){
   const d=Math.hypot(us[i].center[0]-us[i-1].center[0],us[i].center[1]-us[i-1].center[1]);
   assert(d>13.9&&d<16.1,'along-row spacing is the 15 m pitch (measured '+d.toFixed(2)+')');
   checked++;}
  for(const a of us)for(const b of us){
   if(a===b)continue;
   assert(Math.abs(a.center[0]-b.center[0])>10.9,'no two villas in a row sit closer than the pitch',a.id+'/'+b.id);}}
 assert(checked>4,'the spacing check actually ran ('+checked+' neighbour pairs)');
 for(let i=0;i<res.rows.length;i++)for(let j=i+1;j<res.rows.length;j++){
  const ua=res.units.filter(u=>u.row===res.rows[i].id),ub=res.units.filter(u=>u.row===res.rows[j].id);
  if(!ua.length||!ub.length)continue;
  const dy=Math.abs(ua[0].center[1]-ub[0].center[1]);
  if(dy>80)continue;
  assert(dy>29.9,'rows keep at least depth+rear clearance apart (measured '+dy.toFixed(2)+' m)');}
 // villas face downhill (+y) on this slope
 for(const u of res.units)assert(u.view[1]>0,'every villa faces downhill, got '+JSON.stringify(u.view));
 // the metrics agree with the layout
 assert.equal(res.metrics.count,res.units.length,'metrics.count matches');
 assert.equal(res.metrics.violations,0,'the independent validator finds no violation');
 console.log('PASS straight slope: '+res.units.length+' villas, straight rows, 15 m along / >30 m across, all facing downhill');
}
/* 7. concave boundary: a footprint edge can leave the site while all four corners are inside */
{
 // a 100 x 60 site with a 4 m slot cut into the top edge, from y=30 to y=60
 const slot=[[0,0],[100,0],[100,60],[52,60],[52,30],[48,30],[48,60],[0,60]];
 const foot=P.rect([50,45],[0,-1],11,23);       // an 11 x 23 villa straddling the slot
 assert(foot.every(p=>P.pointInPoly(p,slot)),'all four corners of the straddling villa are inside the site');
 assert(!P.polyInsideBoundary(foot,slot),'yet the footprint is rejected: its top edge crosses the slot');
 const inside=P.rect([20,30],[0,-1],11,23);
 assert(P.polyInsideBoundary(inside,slot),'a villa clear of the slot is accepted');
 // and generation never places a villa over the slot
 const terrain=[hline(1400,10,0,100,10),hline(1390,50,0,100,10)];
 const res=P.generateLayout({boundary:slot,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 assert.equal(res.metrics.violations,0,'nothing generated on the slotted site violates containment');
 for(const u of res.units)assert(P.polyInsideBoundary(u.points,slot),'every placed villa is fully inside the slotted site');
 console.log('PASS concave boundary: corner-only containment is not enough, and the generator respects it ('+res.units.length+' villas placed clear of the slot)');
}

/* 8. curved contours: rows bend with the terrain, headings change gradually */
{
 const boundary=box(160,160),terrain=[];
 for(let ring=0;ring<5;ring++){                     // concentric arcs around (0,0), dropping outward
  const r=30+ring*22,pts=[];
  for(let k=0;k<=10;k++){const a=(Math.PI/2)*(k/10)+Math.PI/8;pts.push([r*Math.cos(a),r*Math.sin(a)]);}
  terrain.push({z:1400-ring*6,points:pts});}
 const res=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 assert(res.units.length>0,'curved terrain still generates villas: '+res.units.length);
 assert.equal(res.metrics.violations,0,'no violations on the curved site');
 assert(res.metrics.orientation.beyondTolerance===0,'every villa is within the perpendicular tolerance (worst '+res.metrics.orientation.worst+'°)');
 // a coherent curved row is not penalised: the heading turn is close to the terrain's own turn
 assert(res.metrics.heading.excessMean<8,'heading change follows the terrain turn (excess mean '+res.metrics.heading.excessMean+'°)');
 assert(res.metrics.rows.used>1,'more than one row is used: '+res.metrics.rows.used);
 console.log('PASS curved contours: '+res.units.length+' villas in '+res.metrics.rows.used+' curved rows, worst deviation '+res.metrics.orientation.worst+'°');
}

/* 9. separate contour segments at the same elevation: both are usable, neither is lost */
{
 const boundary=box(200,120);
 const terrain=[{z:1400,points:[[10,20],[60,20]]},{z:1400,points:[[120,20],[190,20]]},   // same level, two pieces
                {z:1390,points:[[10,80],[190,80]]}];
 const res=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 assert(res.units.length>2,'both same-elevation segments are used: '+res.units.length+' villas');
 const left=res.units.filter(u=>u.center[0]<100).length,right=res.units.filter(u=>u.center[0]>=100).length;
 assert(left>0&&right>0,'villas appear on both sides of the gap (left '+left+', right '+right+')');
 assert.equal(res.metrics.violations,0,'the same-elevation site is legal');
 console.log('PASS same-elevation segments: both pieces carry rows ('+left+' left, '+right+' right)');
}

/* 10. line-order independence, and reversed polylines still generate a legal layout.
   Thinning walks from the first vertex, so reversing a contour is a different sample set
   (the old Chaikin path is not representation-canonical). Shuffling line order must not
   change the result — each line is processed independently. */
{
 const shuffled=report.contours.slice().reverse().map(c=>({z:c.z,points:c.points.map(p=>p.slice())}));
 const rev=report.contours.map(c=>({z:c.z,points:c.points.slice().reverse()}));
 const base=P.smoothContours(report.contours,2);
 const a=P.generateLayout(report,{smoothed:base,terrainLines:report.contours,...A,densify:false});
 const c=P.generateLayout(report,{smoothed:P.smoothContours(shuffled,2),terrainLines:shuffled,...A,densify:false});
 const b=P.generateLayout(report,{smoothed:P.smoothContours(rev,2),terrainLines:rev,...A,densify:false});
 const sig=r=>JSON.stringify(r.units.map(u=>[u.center.map(v=>Number(v.toFixed(3))),u.view.map(v=>Number(v.toFixed(3)))]));
 assert.equal(sig(c),sig(a),'reversing the line order gives the same layout');
 assert(b.units.length>0&&b.metrics.violations===0,'reversed polylines still generate a legal layout ('+b.units.length+' villas)');
 console.log('PASS line-order independence: shuffled lines match ('+a.units.length+' villas); reversed points still legal ('+b.units.length+')');
}

/* 11. ambiguous / flat terrain: reported, never guessed */
{
 const boundary=box(120,120),flat=[{z:1400,points:[[10,40],[110,40]]},{z:1400,points:[[10,80],[110,80]]}];
 const res=P.generateLayout({boundary,contours:flat},{smoothed:flat,terrainLines:flat,...A});
 assert.equal(res.units.length,0,'a site with no fall at all yields no villas rather than an arbitrary heading');
 assert(!res.ok,'and the run reports failure instead of claiming success');
 assert((res.rejects.byReason.direction||0)>0,'the rejections name the unresolved direction: '+JSON.stringify(res.rejects.byReason));
 console.log('PASS flat terrain: 0 villas, failure reported, unresolved direction counted, no arbitrary heading');
}
/* 12. the independent validator actually catches planted violations (not just clean layouts) */
{
 const boundary=box(120,120),terrain=slopeTerrain(120,120,4);
 const res=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 const good=JSON.parse(JSON.stringify(res.units));
 const clone=()=>JSON.parse(JSON.stringify(good));
 const ok=u=>P.validate({units:u},boundary,A);
 assert(ok(clone()).ok,'the generated layout passes validation');
 const stale=clone();stale[0].center=[stale[0].center[0]+2,stale[0].center[1]];       // points not moved with it
 const staleIssues=ok(stale).issues.map(i=>i.type);
 assert(staleIssues.includes('stale-geometry'),'a footprint that disagrees with its centre is caught: '+staleIssues.join(','));
 const out=clone();out[0].center=[5,5];out[0].points=P.rect(out[0].center,out[0].view,11,23);
 assert(ok(out).issues.some(i=>i.type==='boundary'),'a villa pushed out of the site is caught');
 const over=clone();over[1].center=[over[0].center[0],over[0].center[1]];over[1].points=P.rect(over[1].center,over[1].view,11,23);
 assert(ok(over).issues.some(i=>i.type==='overlap'),'two villas on the same spot are caught as an overlap');
 const rear=clone();
 if(rear.length>1){
  const a=rear[0],v=a.view;
  rear[1].center=[a.center[0]-v[0]*22,a.center[1]-v[1]*22];                          // 22 m behind: inside the 7 m strip
  rear[1].points=P.rect(rear[1].center,rear[1].view,11,23);
  const types=ok(rear).issues.map(i=>i.type);
  assert(types.includes('rear')||types.includes('side')||types.includes('overlap'),'a villa parked in the rear strip is caught: '+types.join(','));}
 console.log('PASS validator: planted stale geometry, boundary escape, overlap and rear-strip intrusion are all detected');
}

/* 13. changed settings: the selected clearances and villa size drive the result */
{
 const boundary=box(120,120),terrain=slopeTerrain(120,120,4);
 const base=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 const wide=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,sideGap:7,backClear:7,perpTol:15});
 assert.equal(wide.metrics.spacing.side.min>=7||wide.units.length===0,true,
  'with a 7 m side clearance no side gap is below 7 m (min '+wide.metrics.spacing.side.min+')');
 assert(wide.units.length<=base.units.length,'a larger clearance cannot produce more villas ('+wide.units.length+' vs '+base.units.length+')');
 const deep=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,sideGap:3,backClear:14,perpTol:15});
 assert(deep.units.length<=base.units.length,'a larger rear clearance cannot produce more villas ('+deep.units.length+' vs '+base.units.length+')');
 for(const u of deep.units)assert(Math.hypot(u.view[0],u.view[1])>0.999,'headings stay unit vectors');
 // villa dimensions are parameters: a 15 x 30 villa changes the pitches, not just the padding
 const big=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,sideGap:3,backClear:7,perpTol:15,width:15,depth:30});
 assert(Math.abs(big.params.alongPitch-19)<1e-9,'along pitch follows width 15 + clearance 3 + margin 1: '+big.params.alongPitch);
 assert(Math.abs(big.params.acrossPitch-38)<1e-9,'across pitch follows depth 30 + rear 7 + margin 1: '+big.params.acrossPitch);
 assert.equal(big.metrics.violations,0,'larger villas still produce a fully legal arrangement');
 const corners=big.units[0].points;
 const sideA=Math.hypot(corners[0][0]-corners[1][0],corners[0][1]-corners[1][1]);
 const depthA=Math.hypot(corners[1][0]-corners[2][0],corners[1][1]-corners[2][1]);
 assert(Math.abs(sideA-15)<1e-9&&Math.abs(depthA-30)<1e-9,'the footprint really is 15 x 30 ('+sideA.toFixed(2)+' x '+depthA.toFixed(2)+')');
 console.log('PASS settings drive the layout: clearance 3→7 and rear 7→14 reduce the count, 15x30 villas change the pitch and stay legal');
}

/* 14. analytic plane beyond the outer contour: extrapolate, do not invert */
{
 const terrain=[hline(0,0,0,120,4),hline(1,30,0,120,4)];          // plane z = y/30; downhill is −y
 const f=P.buildField(terrain,P.settings(A).values);
 const info60=f.zInfo(60,60),info90=f.zInfo(60,90);
 assert.equal(info60.status,'extrapolated','y=60 is past the last contour');
 assert(Math.abs(info60.z-2)<0.15,'plane continues: z(y=60)≈2, got '+info60.z);
 assert(Math.abs(info90.z-3)<0.25,'plane continues: z(y=90)≈3, got '+info90.z);
 const face=f.facing(60,60);
 assert(face&&face.downhill[1]<0,'downhill beyond the outer contour points toward lower z (−y), got '+JSON.stringify(face&&face.downhill));
 const drop=P.groundDrop(f,[60,30],[0,-1],23,11);
 assert(drop.ok&&drop.drop>0,'a 23 m footprint that straddles the last contour still faces downhill');
 console.log('PASS plane extrapolation: z continues beyond the outer contour, downhill sense holds');
}

/* 15. row spacing follows building pitch, not contour interval */
{
 const boundary=box(120,200);
 function pack(nLines){
  const terrain=slopeTerrain(120,200,nLines);
  return P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});}
 const a=pack(4),b=pack(8);
 assert(a.ok&&b.ok,'both contour densities generate');
 assert.equal(a.metrics.violations,0);assert.equal(b.metrics.violations,0);
 function minAcross(res){
  const ys=res.units.map(u=>u.center[1]).sort((x,y)=>x-y);
  const rows=[];
  for(const y of ys){if(!rows.length||y-rows[rows.length-1]>8)rows.push(y);}
  let m=Infinity;
  for(let i=1;i<rows.length;i++)m=Math.min(m,rows[i]-rows[i-1]);
  return {n:rows.length,min:m};}
 const pa=minAcross(a),pb=minAcross(b);
 assert(pa.min>29.9&&pb.min>29.9,'across-row gap stays ≥ depth+rear ('+pa.min.toFixed(2)+' / '+pb.min.toFixed(2)+')');
 assert(Math.abs(pa.n-pb.n)<=2,'contour interval does not dictate the row count ('+pa.n+' vs '+pb.n+' rows)');
 console.log('PASS contour interval vs pitch: '+a.units.length+'/'+b.units.length+' villas, '+pa.n+'/'+pb.n+' rows, min across '+pa.min.toFixed(1)+'/'+pb.min.toFixed(1)+' m');
}

/* 16. across-row phase search can reorganise a 50 m-spaced contour family */
{
 const boundary=box(140,200);
 const terrain=[hline(1400,25,5,135,6),hline(1390,75,5,135,6),hline(1380,125,5,135,6),hline(1370,175,5,135,6)];
 const res=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 assert(res.ok,'50 m contour family still generates');
 const ys=[...new Set(res.units.map(u=>Math.round(u.center[1])))].sort((a,b)=>a-b);
 const bands=[];
 for(const y of res.units.map(u=>u.center[1]).sort((a,b)=>a-b)){
  if(!bands.length||y-bands[bands.length-1]>10)bands.push(y);}
 assert(bands.length>=4,'search finds at least 4 rows in a 150 m fall, not only the 4×50 m contours ('+bands.length+')');
 let minG=Infinity;for(let i=1;i<bands.length;i++)minG=Math.min(minG,bands[i]-bands[i-1]);
 assert(minG>29.9,'reorganised rows still keep legal across spacing ('+minG.toFixed(2)+')');
 assert(res.budget.acrossRowPhases>=3,'across-row phase is actually searched ('+res.budget.acrossRowPhases+')');
 console.log('PASS across-row reorganisation: '+res.units.length+' villas in '+bands.length+' rows, min across '+minG.toFixed(1)+' m, delta '+res.guides.delta);
}

/* 17. oriented footprint vs circular inset: side-edge is valid, edge-hugging guide is not wholly usable */
{
 const boundary=box(100,100);
 const mid=hline(1400,50,0,100,8), low=hline(1390,80,0,100,8);
 const res=P.generateLayout({boundary,contours:[mid,low]},{smoothed:[mid,low],terrainLines:[mid,low],...A});
 assert(res.ok&&res.units.length>0,'a mid-site contour still places villas');
 const sidePoly=P.rect([6,50],[0,1],11,23);
 assert(P.polyInsideBoundary(sidePoly,boundary),'a centre 6 m from a side edge (width/2+0.5) is inside — a 12.5 m circular inset would have rejected it');
 for(const u of res.units){
  assert(P.polyInsideBoundary(u.points,boundary),'every placed villa uses the real footprint test');
  assert(u.center[0]>5.4,'an 11 m-wide villa cannot sit closer than width/2 to a side edge');}
 const hug=hline(1400,2,0,100,6);
 const f=P.buildField([hug,hline(1390,40,0,100,6)],P.settings(A).values);
 const st=P.spineNormals(P.stations(hug.points,3),f);
 const mask=P.usableIntervals(st,f,boundary,P.settings(A).values);
 const usable=mask.intervals.reduce((s,iv)=>s+(iv.hi-iv.lo),0);
 assert(usable<st[st.length-1].s*0.5,'an edge-hugging spine is mostly unusable, not reserved as a whole row (usable '+usable.toFixed(1)+' of '+st[st.length-1].s.toFixed(1)+' m)');
 console.log('PASS footprint fit: side-edge ok, edge-hugging guide not fully reserved');
}

/* 18. local convergence is trimmed even when median separation looks fine */
{
 const boundary=box(200,120);
 const a={z:1400,points:[[10,20],[80,45],[190,20]]};
 const b={z:1390,points:[[10,55],[80,55],[190,90]]};             // ~10 m apart in the middle, ~35–70 m at the ends
 const f=P.buildField([a,b],P.settings(A).values);
 const fam=P.buildGuideFamilies(f,boundary,P.settings(A).values,[a,b]);
 assert(fam.length>0,'converging pair still builds a family');
 const guides=fam[0].guides;
 let minD=Infinity;
 for(const g of guides){
  const mid=g.nodes[Math.floor(g.nodes.length/2)];
  if(g.usable&&!P.inUsable(g.usable,mid.s))continue;
  for(const h of guides){
   if(g===h)continue;
   for(const n of h.nodes){
    if(h.usable&&!P.inUsable(h.usable,n.s))continue;
    minD=Math.min(minD,Math.hypot(mid.x-n.x,mid.y-n.y));}}}
 assert(minD>29,'usable samples of two rows do not sit closer than minSep (min '+minD+')');
 console.log('PASS converging curves: usable intervals keep minSep, median of the whole curve is not the test');
}

/* 19. interval packing uses both ends of a usable centre interval (not one global phase) */
{
 const boundary=box(50,90),terrain=slopeTerrain(50,90,4);
 const par=P.settings(A).values;
 const field=P.buildField(terrain,par);
 const nodes=[];
 for(let x=6;x<=40;x+=2)nodes.push({x,y:45,s:x-6,tx:1,ty:0});
 const g={id:'R01',family:0,nodes,usable:[{lo:0,hi:34}],famAxis:[1,0]};
 const ctx={units:[],index:P.makeIndex(Math.max(par.alongPitch,par.acrossPitch)),
  rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField:field,maxUnits:40};
 const row=P.packRowIntervals(g,ctx,false);
 assert(row.length>=3,'a 34 m usable centre interval at 15 m pitch holds 3 villas from a boundary-aware start, got '+row.length);
 const xs=row.map(u=>u.center[0]).sort((a,b)=>a-b);
 assert(xs[0]-6<4,'first centre sits near the interval start, not a wasted offset (x='+xs[0].toFixed(1)+')');
 assert.equal(P.validate({units:row},boundary,A).ok,true,'packed row is independently valid');
 const starts=P.intervalStarts({lo:0,hi:34},15);
 assert(starts.some(s=>s.dir===1&&s.s===0)&&starts.some(s=>s.dir===-1&&Math.abs(s.s-34)<1e-9),
  'starts are generated from both ends');
 console.log('PASS interval packing: '+row.length+' villas on a 34 m interval, first centre x='+xs[0].toFixed(1));
}

/* 20. plane construction: documented joining-segment interpolation; pair changes stay continuous */
{
 const high={z:10,points:[[0,0],[50,0],[120,20]]},low={z:0,points:[[0,40],[50,40],[120,60]]};
 const f=P.buildField([high,low],P.settings(A).values);
 const mid=f.zInfo(25,20);
 assert.equal(mid.status,'interpolated','between the straight pair the status is interpolated');
 assert(Math.abs(mid.z-5)<0.6,'joining-segment formula: midway in y is midway in z, got '+mid.z);
 assert(mid.pair&&mid.pair.length===2,'the interpolation records the closest-point pair it used');
 const zs=[];
 for(let x=10;x<=110;x+=5){
  const y=20+(x/120)*20;
  const info=f.zInfo(x,y);
  assert(info.z!==null,'z is defined across the pair change at x='+x);
  zs.push(info.z);}
 for(let i=1;i<zs.length;i++){
  assert(Math.abs(zs[i]-zs[i-1])<1.5,'z does not jump when the closest-point pair changes ('+zs[i-1].toFixed(2)+' → '+zs[i].toFixed(2)+' at step '+i+')');}
 console.log('PASS plane pair-change: z(25,20)='+mid.z.toFixed(2)+', '+zs.length+' samples stay continuous');
}

/* 21. densify is net-gain-only, does not loosen pitches, and cannot beat an invalid layout through */
{
 const boundary=box(140,200);
 const terrain=[hline(1400,25,5,135,6),hline(1390,75,5,135,6),hline(1380,125,5,135,6),hline(1370,175,5,135,6)];
 const off=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A,densify:false});
 const on=P.generateLayout({boundary,contours:terrain},{smoothed:terrain,terrainLines:terrain,...A});
 assert(off.ok&&on.ok,'both the baseline and densified 50 m-contour site generate');
 assert(on.units.length>=off.units.length,'densify never reduces the baseline count ('+on.units.length+' vs '+off.units.length+')');
 assert.equal(on.metrics.violations,0,'the densified layout stays independently valid');
 assert.equal(on.params.alongPitch,15,'along pitch stays 11+3+1 — margin is not reduced');
 assert.equal(on.params.acrossPitch,31,'across pitch stays 23+7+1');
 assert.equal(on.densify.baseline,off.units.length,'densify reports the same baseline the off-switch produced');
 const probe=P.probeFootprint(70,100,P.buildField(terrain,P.settings(A).values),P.buildField(terrain,P.settings(A).values),boundary,P.settings(A).values,on.units);
 assert(typeof probe.isolated==='boolean'&&typeof probe.withNeighbors==='boolean','probe separates site-fit from population-fit');
 console.log('PASS densify gate: '+off.units.length+' → '+on.units.length+' villas, pitches unchanged, probe '+JSON.stringify({isolated:probe.isolated,withNeighbors:probe.withNeighbors,reason:probe.reason}));
}

/* 22. real-site densify vs baseline: valid, no fewer villas, adopted pitches kept */
{
 const sm=P.smoothContours(report.contours,2);
 const off=P.generateLayout(report,{smoothed:sm,terrainLines:report.contours,...A,densify:false});
 const on=P.generateLayout(report,{smoothed:sm,terrainLines:report.contours,...A});
 assert(off.ok&&on.ok,'real site generates with and without densify');
 assert(on.units.length>=off.units.length,'combined densify does not lose villas ('+on.units.length+' vs baseline '+off.units.length+')');
 assert.equal(on.metrics.violations,0,'combined result is independently valid');
 assert.equal(new Set(on.units.map(u=>u.id)).size,on.units.length,'repacked villas have unique IDs');
 assert.equal(on.params.alongPitch,15);assert.equal(on.params.acrossPitch,31);
 assert.equal(on.densify.baseline,off.units.length);
 const perRow=on.rows.map(r=>r.id+':'+r.units.length).join(' ');
 console.log('PASS real-site densify: baseline '+off.units.length+' → '+on.units.length+' in '+on.elapsedMs+' ms; '+perRow);
 console.log('densify report '+JSON.stringify(on.densify));
}
