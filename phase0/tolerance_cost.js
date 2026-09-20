/* Cost of re-aiming the long axes onto the local contour normal, per arrangement.
 *
 *   node phase0/tolerance_cost.js
 *
 * Planar fitting flips uphill arrows (a rule) and rotates every long axis further than the
 * perpendicular tolerance off the local contour normal onto it (a preference). This prints
 * what each tolerance costs on the shipped arrangements: axes rotated, uphill flips, villas
 * slid, ghosts, active villas left, view failures, and the worst active deviation that
 * remains. 89° stands in for "no re-aiming at all" — the behaviour before the rotation was
 * implemented. Read it before changing the default: the tolerance is the dial between the
 * orientation rule and the villa count.
 */
const fs=require('node:fs');
const T=require('./terrain_edit.js');
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
const lines=T.buildFromContours(report.contours);
const TOLS=[15,0,30,45,89];
console.log('shipped active counts: '+report.layouts.map(l=>l.name+' '+l.units.filter(u=>u.active!==false).length).join(', '));
console.log('layout        tol  re-aimed  flips  slid  maxMove  ghosted  active  viewBad  left>tol  worst  legal');
for(const l of report.layouts){
  for(const tol of TOLS){
    const data={layouts:[JSON.parse(JSON.stringify(l))],rules:report.rules};
    const shipped=data.layouts[0].units.map(u=>u.view);
    const re=T.apply(data,lines,tol);
    let reaimed=0,flips=0;
    const turned=(a,b)=>{const ang=Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;if(ang<=0.5)return;if(Math.abs(ang-180)<0.5)flips++;else reaimed++;};
    re[0].units.forEach((u,i)=>turned(shipped[i],u.view));
    const fit=T.fitLayout(re[0],report.boundary,lines,{sideGap:3,maxMove:12,perpTol:tol});
    fit.units.forEach((u,i)=>turned(re[0].units[i].view,u.view));
    const bad=new Set(fit.remaining.map(x=>x.i));
    const active=fit.units.map((u,i)=>bad.has(i)?false:(u.active!==false));
    const dev=T.perpReport({units:fit.units},lines,tol,active);
    const g=T.geomCheck({units:fit.units},report.boundary,active,3);
    console.log(`${l.name.padEnd(12)} ${String(tol).padStart(3)}  ${String(reaimed).padStart(7)}  ${String(flips).padStart(5)}  ${String(fit.moves.filter(m=>Math.hypot(m.dx,m.dy)>0.05).length).padStart(4)}  ${Math.max(0,...fit.moves.map(m=>Math.hypot(m.dx,m.dy))).toFixed(1).padStart(6)}  ${String(bad.size).padStart(6)}  ${String(active.filter(Boolean).length).padStart(6)}  ${String(g.conflicts.length+g.issues.length).padStart(7)}  ${String(dev.count).padStart(8)}  ${dev.worst.toFixed(1).padStart(5)}  ${g.ok?'yes':'NO'}`);
  }
}
