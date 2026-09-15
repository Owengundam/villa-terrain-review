const assert=require('node:assert/strict'),v=require('../view3d.js');
const u=(id,x,y)=>({id,center:[x,y],view:[0,1],reference:0,points:[[x-5.5,y-11.5],[x+5.5,y-11.5],[x+5.5,y+11.5],[x-5.5,y+11.5]]});
const l={units:[u('A',0,0),u('B',40,0),u('C',80,0)],conflicts:[[0,1]],outside:[]},mask=[true,false,false],z=[0,0,0];
let s=v.edit(l,mask,z,0,true,[],v.defaults);assert(s.valid);assert.deepEqual(s.active,[false,true,true]);assert.deepEqual(s.heldOff,[0]);assert.deepEqual(mask,[true,false,false]);assert.deepEqual(z,[0,0,0]);
let rejected=v.edit(l,s.active,s.z,0,true,s.heldOff,v.defaults);assert(rejected.rejected);assert.deepEqual(rejected.active,s.active);assert.deepEqual(rejected.z,s.z);assert.deepEqual(rejected.heldOff,[0]);assert(rejected.message.includes('clearance'));
let manual=v.edit(l,mask,z,0,false,[],v.defaults);assert.deepEqual(manual.active,[false,false,false]);
let held=v.edit(l,[false,true,true],z,2,true,[0],v.defaults);assert.deepEqual(held.active,[false,true,false]);assert.deepEqual(held.heldOff,[0,2]);
let on=v.edit(l,[false,false,false],z,0,true,[0],v.defaults);assert(on.valid&&!on.rejected);assert.deepEqual(on.heldOff,[]);
const views={units:[u('rear',0,0),u('front',0,40)],conflicts:[],outside:[]};
let bad=v.edit(views,[true,false],z.slice(0,2),1,true,[],{...v.defaults,height:100,clear:1,centralClear:1});assert(bad.rejected&&bad.message.includes('rear'));assert.deepEqual(bad.active,[true,false]);assert.deepEqual(bad.z,[0,0]);
console.log('PASS safe restoration, manual exclusions, off mode, rejection rollback and view failure message');
const reverse=v.edit(l,s.active,s.z,0,true,s.heldOff,v.defaults,s.undoPoint);assert(reverse.valid&&!reverse.rejected);assert.deepEqual(reverse.active,mask);assert.deepEqual(reverse.z,z);
const fs=require('node:fs'),report=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8')),layout=report.layouts[3],initial=layout.units.map(u=>u.active),pads=layout.units.map(u=>u.z);
for(const id of ['V001','V084']){const i=layout.units.findIndex(u=>u.id===id),off=v.edit(layout,initial,pads,i,true,[],report.rules.view3d),back=v.edit(layout,off.active,off.z,i,true,off.heldOff,report.rules.view3d,off.undoPoint);assert(back.valid&&!back.rejected);assert.deepEqual(back.active,initial);assert.deepEqual(back.z,pads);}
console.log('PASS exact Staggered 3 V001 / V084 round trips');
