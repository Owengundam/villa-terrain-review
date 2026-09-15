const assert=require('node:assert/strict'),fs=require('node:fs'),v=require('../view3d.js');
const unit=(id,x,y,z=0)=>({id,center:[x,y],view:[0,1],reference:z,points:[[x-5.5,y-11.5],[x+5.5,y-11.5],[x+5.5,y+11.5],[x-5.5,y+11.5]]});
const l={units:[unit('A',0,0),unit('B',0,40)],conflicts:[],outside:[]};
const metric=(r,z=[0,0])=>v.measure(l,[true,true],z,{...v.defaults,...r})[0];
assert(metric({height:1}).blocked<metric({height:5}).blocked,'partial height has proportional effect');
assert(metric({height:1}).blocked>0,'low building still covers part of downward view');
assert(metric({eye:8}).blocked<metric({eye:1.5}).blocked,'elevated eye improves view');
assert.equal(v.measure(l,[true,false],[0,0],v.defaults)[0].blocked,0,'ghost ignored');
const duplicate={...l,units:[...l.units,{...l.units[1],id:'C'}]};
assert.equal(v.measure(duplicate,[true,true,true],[0,0,0],v.defaults)[0].blocked,metric({}).blocked,'overlapping silhouettes counted once');
assert.equal(v.union([[-4,1],[-2,4]],-5,5),8);
assert.equal(v.centralHalf(v.defaults),2.5);
assert.equal(v.centralHalf({...v.defaults,top:1}),1);
assert.equal(v.centralHalf({...v.defaults,bottom:-1}),1);
assert(Math.abs(metric({height:1},[0,0]).central-metric({height:1},[0,2]).central)<1e-10,'mirrored silhouettes above and below eye have equal central obstruction');
assert.throws(()=>v.settings({bottom:1}));
// Independent 3D ray / oriented box slab intersection; no angular-envelope code reused.
function hit(o,d,u,pad,height){const side=[u.view[1],-u.view[0]],delta=[o[0]-u.center[0],o[1]-u.center[1]],p=[delta[0]*side[0]+delta[1]*side[1],delta[0]*u.view[0]+delta[1]*u.view[1],o[2]-pad],ray=[d[0]*side[0]+d[1]*side[1],d[0]*u.view[0]+d[1]*u.view[1],d[2]],low=[-5.5,-11.5,0],high=[5.5,11.5,height];let enter=1e-7,exit=Infinity;for(let a=0;a<3;a++){if(Math.abs(ray[a])<1e-12){if(p[a]<low[a]||p[a]>high[a])return false;}else{const x=(low[a]-p[a])/ray[a],y=(high[a]-p[a])/ray[a];enter=Math.max(enter,Math.min(x,y));exit=Math.min(exit,Math.max(x,y));}}return exit>=enter;}
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));let rays=0;
for(const layout of report.layouts){const active=layout.units.map(u=>u.active),z=layout.units.map(u=>u.z),r=report.rules.view3d,state=v.inspect(layout,active,z,r);assert(state.valid,layout.name);
 layout.units.forEach((u,i)=>{if(!active[i])return;const strips=v.measure(layout,active,z,r,i)[i].strips,side=[u.view[1],-u.view[0]],o=[u.center[0]+11.5*u.view[0],u.center[1]+11.5*u.view[1],z[i]+r.eye];
  for(let k=0;k<120;k++)for(let b=0;b<30;b++){const a=(-15+(k+.5)*.25)*Math.PI/180,e=(r.bottom+(b+.5)*(r.top-r.bottom)/30)*Math.PI/180,d=[Math.cos(e)*(u.view[0]*Math.cos(a)+side[0]*Math.sin(a)),Math.cos(e)*(u.view[1]*Math.cos(a)+side[1]*Math.sin(a)),Math.sin(e)],blocked=layout.units.some((q,j)=>j!==i&&active[j]&&hit(o,d,q,z[j],r.height));
   if(blocked)assert(strips[k].some(([lo,hi])=>e*180/Math.PI>=lo-1e-8&&e*180/Math.PI<=hi+1e-8),'conservative envelope must include every independent ray hit');rays++;
  }
 });console.log(layout.name,layout.retained_count,'PASS');
}
console.log('PASS partial height, eye height, union, ghosts, validation and',rays,'independent 3D rays');
