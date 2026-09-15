const assert=require('node:assert/strict'),fs=require('node:fs'),v=require('../view3d.js');
const u=(id,x,y)=>({id,center:[x,y],view:[0,1],reference:0,points:[[x-5.5,y-11.5],[x+5.5,y-11.5],[x+5.5,y+11.5],[x-5.5,y+11.5]]});
const l={units:[u('A',0,0),u('B',40,0),u('C',80,0)],conflicts:[[0,1]],outside:[]},mask=[true,false,false],z=[0,0,0];
let s=v.edit(l,mask,z,0,true,[],v.defaults);assert(s.valid);assert.deepEqual(s.active,[false,true,true]);assert.deepEqual(s.heldOff,[0]);assert.deepEqual(mask,[true,false,false]);assert.deepEqual(z,[0,0,0]);assert.deepEqual(s.changes.map(c=>c.type),['deactivated','activated','activated']);
const on=v.edit(l,s.active,s.z,0,true,s.heldOff,v.defaults);assert(on.valid&&on.active[0]&&!on.active[1]&&on.active[2]);assert(!on.rejected);assert(on.changes.some(c=>c.id==='B'&&c.type==='deactivated'&&c.automatic));
const reject=v.edit(l,s.active,s.z,0,false,s.heldOff,v.defaults);assert(reject.rejected);assert.deepEqual(reject.active,s.active);assert.deepEqual(reject.z,s.z);
const views={units:[u('rear',0,0),u('front',0,40)],conflicts:[],outside:[]},r={...v.defaults,height:100,clear:1,centralClear:1};
for(const i of [0,1]){let a=[true,true];a[i]=false;const result=v.edit(views,a,[0,0],i,true,[],r);assert(result.valid&&result.active[i]&&!result.active[1-i]);}
const report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
for(const layout of report.layouts){const initial=layout.units.map(u=>u.active),pads=layout.units.map(u=>u.z),i=initial.findIndex(Boolean),off=v.edit(layout,initial,pads,i,true,[],report.rules.view3d),back=v.edit(layout,off.active,off.z,i,true,off.heldOff,report.rules.view3d);assert(off.valid&&!off.active[i]);assert(back.valid&&back.active[i]&&!back.rejected);for(const result of [off,back])assert(v.inspect(layout,result.active,result.z,report.rules.view3d).valid);console.log(layout.name,back.message);}
console.log('PASS protected activation, affected removal, own blockers, manual rejection, change records and real layout round trips');
