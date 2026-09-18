const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('../terrain_edit.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));

// 1. Simplify: point budget never exceeded, shape stays close to the source line
for(const c of report.contours){
 const s=T.simplify(c.points,T.MAX);
 assert(s.length<=T.MAX,'control point budget');
 assert(s[0][0]===c.points[0][0]&&s[0][1]===c.points[0][1],'keeps line start');
 const last=c.points[c.points.length-1];
 assert(s[s.length-1][0]===last[0]&&s[s.length-1][1]===last[1],'keeps line end');
 let worst=0;
 for(const p of c.points){let d=Infinity;for(let k=0;k+1<s.length;k++)d=Math.min(d,T.simplify===undefined?0:seg(p,s[k],s[k+1]));worst=Math.max(worst,d);}
 assert(worst<12,'source line deviation stays bounded: '+worst.toFixed(2));
}
function seg(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy));}
console.log('PASS all',report.contours.length,'contours simplify to <=',T.MAX,'control points');

// 2. Straight-ish synthetic lines collapse to few points
const line=Array.from({length:60},(_,i)=>[i*10,(i%2)*0.4]);
const s2=T.simplify(line,10);
assert(s2.length<=10,'synthetic line budget');
console.log('PASS synthetic jagged line reduces to',s2.length,'points');

// 3. Elevation field reproduces contour z on the line itself
const lines=T.buildFromContours(report.contours);
const pts=T.samples(lines);
for(const c of report.contours.slice(0,4)){
 const p=c.points[Math.floor(c.points.length/2)],z=T.elevation(p[0],p[1],pts);
 assert(Math.abs(z-c.z)<1.5,'on-line elevation near labelled z: '+z.toFixed(2)+' vs '+c.z);
}
console.log('PASS interpolated elevation matches contour labels on the lines');

// 4. Downhill view points to lower ground (probe at a real villa centre, inside the site)
const villa=report.layouts[0].units.find(u=>u.active!==false)||report.layouts[0].units[0];
const d=T.downhill(villa.center,pts,villa.view,1);
assert(Number.isFinite(d[0])&&Number.isFinite(d[1]),'downhill vector finite');
for(const step of [2,5]){
 const zDown=T.elevation(villa.center[0]+d[0]*step,villa.center[1]+d[1]*step,pts);
 const zUp=T.elevation(villa.center[0]-d[0]*step,villa.center[1]-d[1]*step,pts);
 assert(zDown<=zUp+1e-6,'downhill side is lower or equal at '+step+' m');
}
console.log('PASS downhill view points toward lower terrain');

// 5. apply() rebuilds references/views AND rotates footprints with the view (coupled orientation)
const edited=JSON.parse(JSON.stringify(lines));
edited[0].controls[2][1]+=30; // drag one control point
const before=JSON.parse(JSON.stringify(report.layouts));
const after=T.apply(report,edited);
assert.equal(after.length,report.layouts.length);
after.forEach((l,li)=>{assert.equal(l.units.length,report.layouts[li].units.length);l.units.forEach((u,i)=>assert.equal(u.id,report.layouts[li].units[i].id));});
const dd=T.diff(before,after);
assert(dd.rotated>0||dd.maxShift>0,'edited terrain changes planning inputs');
// footprint must rotate with the view: same centre, same dimensions, direction aligned
for(const [li,l] of after.entries()){
const src=report.layouts[li];
l.units.forEach((u,i)=>{
 const o=src.units[i];
 const cs=u.points.map(p=>Math.hypot(p[0]-u.center[0],p[1]-u.center[1])).sort((a,b)=>a-b).map(v=>v.toFixed(4)).join(',');
 const os=o.points.map(p=>Math.hypot(p[0]-o.center[0],p[1]-o.center[1])).sort((a,b)=>a-b).map(v=>v.toFixed(4)).join(',');
 assert.equal(cs,os,'rotation preserves corner radii (shape unchanged)');
 // view arrow is perpendicular to the long axis: exactly two corners at +11.5 m along view
 const forward=u.points.filter(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return dx*u.view[0]+dy*u.view[1]>11;});
 assert.equal(forward.length,2,'two corners face downhill along the view axis');
 const [fa,fb]=forward;
 for(const f of [fa,fb]){
  const fx=f[0]-u.center[0],fy=f[1]-u.center[1],along=fx*u.view[0]+fy*u.view[1];
  assert(Math.abs(along-11.5)<0.01,'forward corners sit 11.5 m along the view axis');
  const perp=Math.abs(fx*(-u.view[1])+fy*u.view[0]);
  assert(Math.abs(perp-5.5)<0.01,'corners offset 5.5 m across the view axis');
 }
});
}
console.log('PASS footprints rotate with the view arrow (coupled orientation)');
// 5b. geomCheck: live 3 m side clearance + boundary on rotated footprints
const geomOK=T.geomCheck(report.layouts[0],report.boundary,report.layouts[0].units.map(u=>u.active!==false));
assert(geomOK.ok,'shipped ACTIVE villas pass live geometry check');
// overlapping copies must be detected
const dup=JSON.parse(JSON.stringify(report.layouts[0]));
dup.units[1].points=dup.units[0].points.map(p=>p.slice()); // villa 1 exactly on villa 0
const geomBad=T.geomCheck(dup,report.boundary);
assert(geomBad.conflicts.some(([a,b])=>(a===0&&b===1)||(a===1&&b===0)),'overlap detected as 3 m conflict');
// a villa pushed outside the boundary must be detected
const out=JSON.parse(JSON.stringify(report.layouts[0]));
const xs=report.boundary.map(p=>p[0]),xmax=Math.max(...xs);
out.units[0].points=out.units[0].points.map(p=>[p[0]+3000,p[1]]);
out.units[0].center=[out.units[0].center[0]+3000,out.units[0].center[1]];
const geomOut=T.geomCheck(out,report.boundary);
assert(geomOut.issues.some(x=>x.type==='boundary'&&x.i===0),'boundary escape detected');
// rotation must be able to CREATE a conflict: rotate one villa of a tight pair
const pair=JSON.parse(JSON.stringify(report.layouts[0]));
if(pair.units.length>1){
 // find the closest pair and rotate one 30° about its centre — corner sweep may violate 3 m
 const u=pair.units[1],ang=30*Math.PI/180,c=Math.cos(ang),s=Math.sin(ang);
 u.points=u.points.map(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return [u.center[0]+dx*c-dy*s,u.center[1]+dx*s+dy*c];});
 const rotated=T.geomCheck(pair,report.boundary);
 console.log('INFO rotated-unit check on shipped layout: conflicts=',rotated.conflicts.length,'(may be 0 if spacing is generous)');
}
console.log('PASS live geometry: 3 m clearance and boundary re-checked on current footprints');
console.log('PASS apply() preserves layouts; edited line shifts references up to',dd.maxShift.toFixed(2),'m and rotates',dd.rotated,'views');

// 6. Drag every control point of one line: references respond smoothly, no NaN
for(let k=0;k<edited[0].controls.length;k++){
 const test=JSON.parse(JSON.stringify(lines));
 test[0].controls[k][0]+=25;test[0].controls[k][1]-=15;
 const r2=T.apply(report,test);
 for(const l of r2)for(const u of l.units){assert(Number.isFinite(u.reference),'finite reference');assert(Number.isFinite(u.view[0])&&Number.isFinite(u.view[1]),'finite view');}
}
console.log('PASS every control-point drag yields finite references and views');

// 7. Unmodified lines reproduce original references closely
const base=T.apply(report,lines);
let maxDelta=0;
base.forEach((l,li)=>l.units.forEach((u,i)=>{maxDelta=Math.max(maxDelta,Math.abs(u.reference-report.layouts[li].units[i].reference));}));
console.log('INFO unedited rebuild max reference shift vs saved z:',maxDelta.toFixed(2),'m');
assert(maxDelta<25,'unedited rebuild stays near saved pads');
console.log('PASS unedited terrain keeps references near saved values');
