const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const diagrams=require('../elevation_diagrams.js');
const report=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../output/checks/image-reduction-20260915/report.json'),'utf8'));
let count=0;
for(const layout of report.layouts){
 const active=layout.units.map(u=>u.active),state={z:layout.units.map(u=>u.z)};
 for(let selected=0;selected<active.length;selected++){
  const pairs=diagrams.pairs(layout,active,state,selected);
  assert.equal(pairs.length,layout.spans[selected].length,'include every footprint in cone, including inactive');
  for(const p of pairs){assert.equal(p.drop,state.z[selected]-state.z[p.j]);assert(p.hi>p.lo);assert.equal(p.blocks,active[selected]&&active[p.j]&&p.drop<5.25-1e-6);}
  for(const width of [320,350,700]){
   const html=diagrams.render(layout,active,state,selected,width,{fg:'#20362f',muted:'#65776e',border:'#d6ded5',green:'#43896a',red:'#c73535',bg:'#ffffff'});
   assert(!/NaN|undefined|Infinity/.test(html));assert.equal((html.match(/<svg /g)||[]).length,Math.max(1,pairs.length));
   if(selected===0&&layout.name==='free'&&width===350)fs.writeFileSync(path.resolve(__dirname,'../../output/checks/image-reduction-20260915/elevation-example.svg'),html.match(/<svg[\s\S]*?<\/svg>/)[0]);
  }
  count++;
 }
}
console.log('PASS',count,'selections, three responsive widths, all active/ghost cone participants');
