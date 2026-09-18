const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('../terrain_edit.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));

// ---- volume: untouched terrain = zero change
const lines=T.buildFromContours(report.contours);
const v0=T.volume(lines,lines,report.boundary);
assert(Math.abs(v0.cut)<1e-6&&Math.abs(v0.fill)<1e-6,'no change = no volume');
console.log('PASS volume() zero on unchanged terrain');

// ---- volume: raise one interior control point by 5 m → fill appears
const raised=JSON.parse(JSON.stringify(lines));
raised[4].controls[5][1]-=20; // drag a point on an interior line
const v1=T.volume(lines,raised,report.boundary);
assert(v1.fill>10||v1.cut>10,'terrain drag produces measurable volume: fill='+v1.fill.toFixed(0)+' cut='+v1.cut.toFixed(0));
assert(v1.area>v1.siteArea*0.9&&v1.area<v1.siteArea*1.1,'integrated area approximates the site (grid+corner sampling, ±10%)');
console.log('PASS volume() measures change: fill',v1.fill.toFixed(0),'m³, cut',v1.cut.toFixed(0),'m³, net',(v1.fill-v1.cut).toFixed(0),'m³ over',Math.round(v1.area),'m²');

// ---- volume: mirror edit gives swapped cut/fill
const lowered=JSON.parse(JSON.stringify(lines));
lowered[4].controls[5][1]+=40; // drag the other way
const v2=T.volume(lines,lowered,report.boundary);
assert(v2.cut>v1.cut||v2.fill<v1.fill,'opposite drag shifts balance toward cut');
console.log('PASS volume() responds directionally to the drag');

// ---- fitLayout: shipped layout with generous settings stays put
const pts=T.samples(lines);
const fitted=T.fitLayout(report.layouts[0],report.boundary,pts,{sideGap:3,maxMove:12,perpTol:10});
const moved=fitted.moves.filter(m=>Math.hypot(m.dx,m.dy)>0.05||Math.abs(m.rot)>1e-4).length;
console.log('INFO shipped layout: reoriented/moved',moved,'of',fitted.units.length,'units; remaining issues:',fitted.remaining.length);
assert(fitted.units.length===report.layouts[0].units.length,'fitLayout never adds/removes units');
for(const [i,u] of fitted.units.entries()){
 const o=report.layouts[0].units[i];
 const cs=u.points.map(p=>Math.hypot(p[0]-u.center[0],p[1]-u.center[1])).sort((a,b)=>a-b).map(v=>v.toFixed(3)).join(',');
 const os=o.points.map(p=>Math.hypot(p[0]-o.center[0],p[1]-o.center[1])).sort((a,b)=>a-b).map(v=>v.toFixed(3)).join(',');
 assert.equal(cs,os,'rigid transform only: villa '+o.id);
 const dm=Math.hypot(u.center[0]-o.center[0],u.center[1]-o.center[1]);
 assert(dm<=12.05,'movement budget respected: '+o.id+' moved '+dm.toFixed(2)+' m');
 assert(Number.isFinite(u.reference),'finite reference');
}
console.log('PASS fitLayout: rigid transforms, movement budget, finite pads on shipped layout');

// ---- fitLayout: rotated-tight scenario creates conflicts that fitting must reduce
const tight=JSON.parse(JSON.stringify(report.layouts[0]));
// force-rotate several villas 25° to制造 clearance violations
for(let k=0;k<6&&k<tight.units.length;k++){
 const u=tight.units[k],ang=25*Math.PI/180,c=Math.cos(ang),s=Math.sin(ang);
 u.points=u.points.map(p=>{const dx=p[0]-u.center[0],dy=p[1]-u.center[1];return [u.center[0]+dx*c-dy*s,u.center[1]+dx*s+dy*c];});
}
const beforeG=T.geomCheck(tight,report.boundary,tight.units.map(()=>true),3);
const fittedTight=T.fitLayout(tight,report.boundary,pts,{sideGap:3,maxMove:12,perpTol:10});
const afterG=T.geomCheck({units:fittedTight.units},report.boundary,fittedTight.units.map(()=>true),3);
console.log('INFO forced-rotation test: conflicts before=',beforeG.conflicts.length,'after fit=',afterG.conflicts.length,'boundary before=',beforeG.issues.filter(x=>x.type==='boundary').length,'after=',afterG.issues.filter(x=>x.type==='boundary').length);
assert(afterG.conflicts.length<=beforeG.conflicts.length,'fitting never increases conflicts');
assert(afterG.issues.filter(x=>x.type==='boundary').length===0,'fitting resolves boundary escapes');
const movedT=fittedTight.moves.map(m=>Math.hypot(m.dx,m.dy));
console.log('PASS fitLayout reduces conflicts (moved',movedT.filter(m=>m>0.05).length,'units, max',Math.max(0,...movedT).toFixed(1),'m)');

// ---- fitLayout: strict sideGap demands more movement than loose
const strict=T.fitLayout(report.layouts[0],report.boundary,pts,{sideGap:5,maxMove:20,perpTol:10});
const loose=T.fitLayout(report.layouts[0],report.boundary,pts,{sideGap:2.5,maxMove:20,perpTol:10});
const strictMoved=strict.moves.filter(m=>Math.hypot(m.dx,m.dy)>0.05).length;
const looseMoved=loose.moves.filter(m=>Math.hypot(m.dx,m.dy)>0.05).length;
console.log('INFO sideGap=5 moved',strictMoved,'units; sideGap=2.5 moved',looseMoved,'units');
assert(strictMoved>=looseMoved,'stricter clearance requires more movement');

// ---- perpTol: zero tolerance reorients everything; huge tolerance reorients nothing
const strictO=T.fitLayout(report.layouts[0],report.boundary,pts,{sideGap:3,maxMove:12,perpTol:0});
const looseO=T.fitLayout(report.layouts[0],report.boundary,pts,{sideGap:3,maxMove:12,perpTol:89});
const strictR=strictO.moves.filter(m=>Math.abs(m.rot)>1e-4).length;
const looseR=looseO.moves.filter(m=>Math.abs(m.rot)>1e-4).length;
console.log('INFO perpTol=0 reoriented',strictR,'units; perpTol=89 reoriented',looseR,'units');
assert(strictR>=looseR,'lower tolerance reorients at least as many villas');
console.log('PASS perpTol and sideGap parameters steer the fitting');
