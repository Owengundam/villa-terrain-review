const VillaPresentation=(()=>{
 const hoverDelay=0;
 function bindHover(node,label,tooltip){
  let timer=null,lastEvent=null;
  const hide=()=>{clearTimeout(timer);timer=null;tooltip.hidden=true;};
  const move=e=>{lastEvent=e;if(tooltip.hidden)return;tooltip.style.left=Math.max(8,Math.min(e.clientX+14,window.innerWidth-tooltip.offsetWidth-8))+'px';tooltip.style.top=Math.max(8,Math.min(e.clientY+16,window.innerHeight-tooltip.offsetHeight-8))+'px';};
  node.onpointerenter=e=>{hide();lastEvent=e;if(e.pointerType==='touch')return;tooltip.textContent=label;tooltip.hidden=false;move(lastEvent);};
  node.onpointermove=move;node.onpointerleave=hide;node.onpointerdown=hide;
  return hide;
 }
 function exportPlan(data,layout,active,valid){
  const units=layout.units.filter((u,i)=>active[i]),W=1600,extent=data.boundary.concat(units.flatMap(u=>u.points));
  const xs=extent.map(p=>p[0]),ys=extent.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),s=(W-160)/(maxX-minX),H=Math.ceil((maxY-minY)*s+210);
  const xy=p=>[80+(p[0]-minX)*s,100+(maxY-p[1])*s],pts=p=>p.map(q=>xy(q).join(',')).join(' ');
  let body=`<rect width="${W}" height="${H}" fill="#ffffff"/><text x="80" y="46" font-size="26" font-family="Arial,sans-serif" fill="#172f3b">${layout.name.replaceAll('-',' ')} · ${units.length} active villas · ${valid?'VALID':'CONFLICTS'}</text>`;
  body+=`<defs><clipPath id="export-site"><polygon points="${pts(data.boundary)}"/></clipPath></defs><g clip-path="url(#export-site)">`;
  body+=data.contours.map(c=>`<polyline points="${pts(c.points)}" fill="none" stroke="#c8d2d8" stroke-width="1.5"/>`).join('');
  body+='</g><polygon points="'+pts(data.boundary)+'" fill="none" stroke="#172f3b" stroke-width="2.5"/>';
  for(const u of units){const c=xy(u.center),v=u.view,side=[v[1],-v[0]],arrow=[[9,0],[6,1.3],[6,-1.3]].map(([a,b])=>[u.center[0]+v[0]*a+side[0]*b,u.center[1]+v[1]*a+side[1]*b]);
   body+=`<g data-villa-id="${u.id}"><polygon points="${pts(u.points)}" fill="#cee4dd" stroke="#226e5b" stroke-width="2"/><polygon points="${pts(arrow)}" fill="#226e5b"/><text x="${c[0]}" y="${c[1]}" text-anchor="middle" font-size="16" font-family="Arial,sans-serif" fill="#172f3b">${u.id}</text></g>`;
  }
  body+=`<line x1="80" y1="${H-66}" x2="${80+20*s}" y2="${H-66}" stroke="#172f3b" stroke-width="3"/><text x="80" y="${H-78}" font-size="18" font-family="Arial,sans-serif" fill="#172f3b">20 m</text><text x="80" y="${H-26}" font-size="18" font-family="Arial,sans-serif" fill="#172f3b">Standard villa 11 × 23 m · Side clearance &gt;3 m · Automatic pads ±1.5 m</text>`;
  return {width:W,height:H,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`};
 }
 return {hoverDelay,bindHover,exportPlan};
})();
if(typeof module!=='undefined')module.exports=VillaPresentation;
