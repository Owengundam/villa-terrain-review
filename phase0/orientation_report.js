/* Orientation authority report — evidence for the uphill/downhill rule.
 *
 * Prints, for the shipped terrain and for edited terrains, how the criterion that Planar
 * fitting uses (TerrainEdit.pointsUphill: contour-label vote, physical reads break ties)
 * scores against an INDEPENDENT graded label read computed from the drawn contour
 * polylines: definite uphill = vote >= +2, definite downhill = vote <= -2.
 *
 *   node phase0/orientation_report.js
 *
 * Reading it: recall counts how many definitely-uphill villas the rule flips; false
 * positives count villas the labels read downhill that it would reverse anyway (these are
 * the reported bug: the user sees an arrow pointing up after fitting). Ambiguous villas
 * (|vote| <= 1: flat, hollow or saddle spots) are listed separately and are decided by the
 * physical reads.
 */
const fs=require('node:fs');
const T=require('./terrain_edit.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));

function segDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
function makeRead(contours){
  const dense=contours.map(c=>({z:c.z,points:c.points}));
  const label=p=>{let best=Infinity,z=null;for(const c of dense)for(let k=0;k+1<c.points.length;k++){const d=segDist(p,c.points[k],c.points[k+1]);if(d<best){best=d;z=c.z;}}return z;};
  return u=>{let v=0;for(const d of [5,10,15,20,25,30,35,40,45]){
    const f=label([u.center[0]+u.view[0]*d,u.center[1]+u.view[1]*d]),b=label([u.center[0]-u.view[0]*d,u.center[1]-u.view[1]*d]);
    if(f!==null&&b!==null)v+=Math.sign(f-b);}return v;};
}
function score(name,contours){
  const pts=T.samples(T.buildFromContours(contours)),vote=makeRead(contours);
  let tp=0,fn=0,fp=0,tn=0,ambFlip=0,ambKeep=0;const fps=[],fns=[];
  for(const l of report.layouts)for(const u of l.units){
    const v=vote(u),dec=T.pointsUphill(u,pts).uphill;
    if(v>=2)dec?tp++:(fn++,fns.push(l.name+'/'+u.id+'('+v+')'));
    else if(v<=-2)dec?(fp++,fps.push(l.name+'/'+u.id+'('+v+')')):tn++;
    else dec?ambFlip++:ambKeep++;
  }
  console.log(`${name}: recall ${tp}/${tp+fn}${fns.length?' MISSED ['+fns.join(' ')+']':''} | false positives ${fp}${fps.length?' ['+fps.join(' ')+']':''} kept ${tn} | ambiguous ${ambFlip} flipped, ${ambKeep} kept`);
  return fp;
}
function flips(contours){
  const pts=T.samples(T.buildFromContours(contours));
  for(const l of report.layouts){
    const ids=l.units.filter(u=>T.pointsUphill(u,pts).uphill).map(u=>u.id);
    console.log(`  ${l.name.padEnd(12)} ${ids.length} arrow(s) to flip${ids.length?': '+ids.join(' '):''}`);
  }
}
console.log('shipped terrain:');
const fpShipped=score('  score',report.contours);
flips(report.contours);

const edit1=report.contours.map((c,i)=>i===0?{...c,points:c.points.map((p,k)=>k===3?[p[0]+60,p[1]-40]:p.slice())}:c);
const edit2=report.contours.map((c,i)=>{
  const p=c.points.map(q=>q.slice());
  if(i===6)p[2]=[p[2][0]-90,p[2][1]+70];
  if(i===12)p[4]=[p[4][0],p[4][1]-120];
  if(i===9)p[1]=[p[1][0],p[1][1]-95];
  return {...c,points:p};});
console.log('one contour line moved (the page test edit):');
const fp1=score('  score',edit1); flips(edit1);
console.log('three contour lines moved:');
const fp2=score('  score',edit2); flips(edit2);
console.log(fpShipped+fp1+fp2===0
  ? 'OK: no villa the labels read downhill would be reversed (0 false positives on all three terrains).'
  : `FAIL: ${fpShipped+fp1+fp2} villa(s) the labels read downhill would be reversed.`);
