/* Pairwise projected elevations. Horizontal offsets are collapsed, not terrain sections. */
const ElevationDiagrams=(()=>{
 function pairs(layout,active,state,selected){
  const u=layout.units[selected],o=[u.center[0]+11.5*u.view[0],u.center[1]+11.5*u.view[1]];
  const project=p=>(p[0]-o[0])*u.view[0]+(p[1]-o[1])*u.view[1];
  return layout.spans[selected].map(([j,a,b])=>{const q=layout.units[j],xs=q.points.map(project),drop=state.z[selected]-state.z[j];return {j,id:q.id,lo:Math.min(...xs),hi:Math.max(...xs),distance:project(q.center),pad:state.z[j],reference:q.reference,drop,angle:(b-a)*180/Math.PI,active:active[j],blocks:active[selected]&&active[j]&&drop<5.25-1e-6};}).sort((a,b)=>a.distance-b.distance||a.j-b.j);
 }
 function render(layout,active,state,selected,width,colors){
  const u=layout.units[selected],list=pairs(layout,active,state,selected),z=state.z[selected],threshold=z-5.25;
  const {fg,muted,border,green,red,bg}=colors;
  const panels=list.length?list:[null],W=Math.max(280,width),H=270;
  const lower=Math.floor(Math.min(threshold,u.reference-1.5,z,...list.flatMap(p=>[p.pad,p.reference-1.5]))-1),upper=Math.ceil(Math.max(z+5,u.reference+1.5,...list.flatMap(p=>[p.pad+5,p.reference+1.5]))+1);
  function panel(p){
   const xlo=Math.min(-23,p?p.lo:-23)-3,xhi=Math.max(8,p?p.hi:8)+3;
   const x=v=>58+(v-xlo)/(xhi-xlo)*(W-74),y=v=>42+(upper-v)/(upper-lower)*166;
   const line=(x1,y1,x2,y2,color,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1" stroke-dasharray="${dash}"/>`;
   const text=(px,py,value,anchor='start',color=fg)=>`<text x="${px}" y="${py}" text-anchor="${anchor}" font-size="11" font-family="sans-serif" fill="${color}">${value}</text>`;
   let s=`<title>${u.id}${p?' and '+p.id:''} projected elevation</title><rect width="${W}" height="${H}" fill="${bg}"/>`;
   const status=p?(!active[selected]?'Selected inactive':!p.active?'Inactive — excluded':p.blocks?'Obstructs angular view':'Height-clear'):'No units within cone';
   s+=text(58,16,`${u.id}${p?' → '+p.id:''} · ${status}`);
   for(let k=0;k<4;k++){const level=lower+(upper-lower)*k/3;s+=line(55,y(level),W-16,y(level),border)+text(50,y(level)+4,level.toFixed(1),'end');}
   s+=text(4,28,'Level (m)');
   s+=line(58,y(threshold),W-16,y(threshold),red,'5 4');
   s+=text(W-16,32,`Front pad limit ${threshold.toFixed(2)} m`,'end');
   function box(lo,hi,pad,reference,on,color,id){
    let b=`<rect x="${x(lo)}" y="${y(pad+5)}" width="${Math.max(1,x(hi)-x(lo))}" height="${y(pad)-y(pad+5)}" fill="${color}" fill-opacity="${on?'.2':'.04'}" stroke="${color}" stroke-dasharray="${on?'none':'4 3'}"/>`;
    b+=line(x(lo),y(pad),x(hi),y(pad),color);
    b+=line(x(lo),y(reference),x(hi),y(reference),muted,'2 3');
    b+=text((x(lo)+x(hi))/2,y(pad+5)-5,id,'middle');return b;
   }
   s+=box(-23,0,z,u.reference,active[selected],fg,u.id);
   if(p)s+=box(p.lo,p.hi,p.pad,p.reference,p.active,p.active?(p.blocks?red:green):muted,p.id);
   s+=line(58,217,W-16,217,fg);
   for(const v of [xlo,(xlo+xhi)/2,xhi])s+=text(x(v),232,v.toFixed(0),'middle');
   s+=text(W/2+20,248,'Distance along selected view (m)','middle');
   const delta=p?`Pad drop ${p.drop.toFixed(2)} m / 5.25 m · cone overlap ${p.angle.toFixed(1)}°`:'Selected villa height: 5 m';
   return `<div><svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${u.id}${p?' compared with '+p.id:''} elevation">${s}</svg><p class="text-small">${delta}</p><p class="text-small">${u.id} pad ${z.toFixed(2)} m (${(z-u.reference).toFixed(2)} m adjustment)${p?` · ${p.id} pad ${p.pad.toFixed(2)} m (${(p.pad-p.reference).toFixed(2)} m adjustment)`:''}</p></div>`;
  }
  return panels.map(panel).join('');
 }
 return {pairs,render};
})();
if(typeof module!=='undefined')module.exports=ElevationDiagrams;
