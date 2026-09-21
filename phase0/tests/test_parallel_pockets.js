const assert=require('node:assert/strict'),P=require('../parallel_para.js');
// A guide is only a possible row: an empty guide must not reserve buildable land.
const boundary=[[0,0],[120,0],[120,140]],terrain=[{z:20,points:[[0,0],[120,0]]},{z:0,points:[[0,140],[120,140]]}];
boundary.splice(3,0,[0,140]);
const par=P.settings({}).values;par.maxUnits=300;
const field=P.buildField(terrain,par);
function guide(id,y){const nodes=[];for(let x=9;x<=99;x+=3)nodes.push({x,y,s:x-9,tx:1,ty:0});return {id,family:0,nodes,usable:[{lo:0,hi:90}],usableRaw:[{lo:0,hi:90}],famAxis:[1,0],offset:y,length:90};}
const source=guide('R01',50),empty=guide('R02',81);
const units=[24,39,54,69,84].map((x,i)=>({id:'V'+i,name:'V'+i,center:[x,50],view:[0,1],points:P.rect([x,50],[0,1],11,23),row:'R01',family:0,order:i,active:true}));
const snapshot=JSON.stringify(units);
const opts={densify:{packRows:false,repackNeighbors:false}};
const r=P.densifyLayout({units},[source,empty],boundary,field,field,par,opts);
assert(r.units.length>units.length,'empty row guides must not veto legal parallel siblings');
assert(r.units.some(u=>Math.abs(u.center[1]-81)<2),'the legal pocket beside the empty guide is used');
assert(P.validate({units:r.units},boundary,par).ok,'all added footprints respect boundary and clearances');
assert.equal(JSON.stringify(units),snapshot,'input villas are preserved');
for(const u of r.units){assert(P.groundDrop(field,u.center,u.view,23,11).ok,'every villa faces downhill');assert(P.withinTol(u.view,field.normalAt(...u.center),15),'orientation stays within tolerance');}
const again=P.densifyLayout({units},[source,empty],boundary,field,field,par,opts);
assert.deepEqual(again.units,r.units,'sibling recovery is deterministic');
console.log('PASS local sibling pockets: '+units.length+' -> '+r.units.length+' villas; legal, downhill, deterministic, source preserved');

// Repacking a missing row must not reuse an ID still owned by another row.
const fixed={...units[0],id:'V003',name:'V003',center:[24,110],points:P.rect([24,110],[0,1],11,23),row:'R03'};
const ctx={units:[fixed],index:P.makeIndex(31),rejects:{byReason:{},details:[]},attempts:0,par,boundary,field,dropField:field,maxUnits:300};ctx.index.add(fixed);
P.packRowIntervals(source,ctx,false);
assert.equal(new Set(ctx.units.map(u=>u.id)).size,ctx.units.length,'row replacements keep IDs unique across frozen and new villas');
console.log('PASS repacked villa IDs remain unique');
