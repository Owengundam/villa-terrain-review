/* Terrain response scale path: per-contour thinning (step = 2 + 2·level m, 1–60) + 1–4 Chaikin
 * passes. Level 0 is an exact deep copy of the accepted source. Always recomputed from the
 * contours handed in — never from a previous smoothing result. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const P=require('../parallel_para.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));

function turning(p){
 let t=0;
 for(let i=1;i<p.length-1;i++){
  const a1=Math.atan2(p[i][1]-p[i-1][1],p[i][0]-p[i-1][0]);
  const a2=Math.atan2(p[i+1][1]-p[i][1],p[i+1][0]-p[i][0]);
  let d=a2-a1;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  t+=Math.abs(d);}
 return t;}

{
 const src=JSON.parse(JSON.stringify(report.contours));
 const out=P.smoothContours(src,0);
 assert.deepEqual(out[0].points,src[0].points,'level 0 = exact copy of accepted contours');
 out[0].points[0][0]=999;
 assert.notEqual(src[0].points[0][0],999,'no shared-array aliasing');
 console.log('PASS level 0: exact deep copy, no aliasing');
}

{
 const src=report.contours.map(c=>({...c,points:c.points.map(p=>p.slice())}));
 const a=P.smoothContours(src,3),b=P.smoothContours(src,3);
 assert.deepEqual(a,b,'smoothing is deterministic');
 assert.deepEqual(src[0].points,report.contours[0].points,'source is not mutated');
 console.log('PASS determinism: identical calls match; always from source');
}

{
 const src=report.contours;
 const s6=P.smoothContours(src,6);
 assert.equal(s6.length,src.length,'1:1 line mapping');
 for(let i=0;i<src.length;i++){
  assert.equal(s6[i].z,src[i].z,'label preserved on line '+i);
  assert(s6[i].points.length>=2,'line '+i+' still has geometry');}
 assert(Math.abs(s6[0].points[0][0]-src[0].points[0][0])<1e-9,'first endpoint kept');
 const last=src[0].points.length-1,outLast=s6[0].points.length-1;
 assert(Math.abs(s6[0].points[outLast][0]-src[0].points[last][0])<1e-9,'last endpoint kept');
 assert(turning(s6[0].points)<turning(src[0].points),'level 6 reduces total turning');
 console.log('PASS level 6: labels, endpoints, 1:1 mapping, less zigzag');
}

{
 const src=report.contours[0].points;
 const s1=P.resample(src,4),s6=P.resample(src,14),s60=P.resample(src,122);
 assert(s6.length<=s1.length,'stronger level uses a longer step so keeps fewer vertices');
 assert(s60.length<=s6.length,'level 60 (122 m) is coarser than level 6 (14 m)');
 const hi=P.smoothContours(report.contours,60);
 assert.equal(hi.length,report.contours.length,'level 60 keeps a 1:1 line mapping');
 assert.equal(hi[0].z,report.contours[0].z,'level 60 preserves labels');
 assert(turning(hi[0].points)<=turning(report.contours[0].points),'level 60 does not add zigzag');
 assert.equal(P.SMOOTH_MAX,60,'slider range is 0–60');
 assert.deepEqual(P.smoothContours(report.contours,99),hi,'values above 60 clamp to 60');
 console.log('PASS step mapping: level 1 → 4 m, 6 → 14 m, 60 → 122 m; Chaikin capped at 4 rounds');
}

{
 const gen0=P.generate(report,{smoothed:P.smoothContours(report.contours,0),sideGap:3,backClear:7});
 const gen6=P.generate(report,{smoothed:P.smoothContours(report.contours,6),sideGap:3,backClear:7});
 assert(gen0.length>0&&gen6.length>0,'populate runs on unsmoothed and max-smoothed guidance');
 const v0=P.verify(gen0,report.boundary,3,7),v6=P.verify(gen6,report.boundary,3,7);
 assert.equal(v0.issues.length,0,'level-0 arrangement verifies');
 assert.equal(v6.issues.length,0,'level-6 arrangement verifies');
 console.log('PASS downstream: generate+verify legal on levels 0 and 6 ('+gen0.length+' / '+gen6.length+' villas)');
}

console.log('\nAll smoothing tests passed.');
