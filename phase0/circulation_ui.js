/* Explicit road action, independent worker and per-layout results. */
const roadResults=new WeakMap();
let roadEntrance=null,roadPicking=false,roadWorker=null,roadJob=0;
function roadInput(){return {layout:data.layouts[index],boundary:data.boundary,contours:data.contours,active:active.slice(),z:state.z.slice(),entrance:roadEntrance,settings:{width:$('roadWidth').value,edge:$('roadEdge').value,backClear:$('backClear').value,entranceWidth:$('arrivalWidth').value},guidance:smoothLevel};}
function roadMessage(text){$('roadStatus').textContent=text;}
function roadOverlay(pts,scale){
 const result=roadResults.get(data.layouts[index]),input=roadInput();let svg='';
 if(roadEntrance){svg+=`<circle cx="${pts([roadEntrance]).split(',')[0]}" cy="${pts([roadEntrance]).split(',')[1]}" r="6" fill="#344cce" stroke="white" stroke-width="2" pointer-events="none"/>`;}
 if(!result){if(!roadWorker&&!roadPicking)roadMessage('No circulation result for this arrangement. Enter a road width and click Generate circulation.');return svg;}
 const stale=result.fingerprint!==Circulation.fingerprint(input),v=result.served.find(v=>v.id===data.layouts[index].units[selected]?.id);
 roadMessage((stale?'OUT OF DATE — generate circulation again. ':'')+`${result.connected}/${result.total} villas connected in plan · ${result.length.toFixed(0)} m lane/connector length · ${result.area.toFixed(0)} m² total road and entrance area. Terrain, vehicle turns and external gate tie-in: not evaluated.`+(v?` Selected ${v.id}: ${v.status}. ${v.reason}.`:''));
 if(!$('roadOverlay').checked)return svg;
 const chosen=new Set(v?.route||[]);
 for(const reservation of result.reservations)if($('roadReservations').checked)for(const polygon of reservation.polygons)svg+=`<polygon points="${pts(polygon)}" fill="#d4aa48" fill-opacity=".12" stroke="#c3962d" stroke-width=".5" pointer-events="none"/>`;
 for(const r of result.roads){const color=stale?'#8b9299':chosen.has(r.id)?'#4738ce':r.kind==='entrance'?'#287e94':'#d39732';
  for(const polygon of r.footprint)svg+=`<polygon points="${pts(polygon)}" fill="${color}" fill-opacity=".48" stroke="${color}" stroke-width=".5" pointer-events="none"/>`;
 }
 for(const v of result.served)if(!v.connected){const u=data.layouts[index].units.find(u=>u.id===v.id);if(u){const p=Circulation.rear(u);svg+=`<circle cx="${pts([p]).split(',')[0]}" cy="${pts([p]).split(',')[1]}" r="4" fill="#c33e3e" pointer-events="none"/>`;}}
 return svg;
}
function cancelRoad(){roadJob++;if(roadWorker){roadWorker.terminate();roadWorker=null;}$('generateRoads').disabled=false;$('cancelRoads').disabled=true;}
$('setEntrance').onclick=()=>{if(busy||fittingBusy)return;roadPicking=true;roadMessage('Click an interior arrival point near the site entrance. Leave room for the full road width. The external gate connection remains unevaluated.');};
$('clearEntrance').onclick=()=>{cancelRoad();roadEntrance=null;roadPicking=false;draw();roadMessage('Entrance cleared. Generate circulation for a row-lane preview.');};
$('map').onclick=e=>{
 if(!roadPicking||busy)return;
 const svg=$('map').querySelector('svg');if(!svg)return;
 const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(svg.getScreenCTM().inverse());
 const xs=data.boundary.map(p=>p[0]),ys=data.boundary.map(p=>p[1]),xmin=Math.min(...xs),ymax=Math.max(...ys),scale=620/(Math.max(...xs)-xmin);
 const world=[xmin+(q.x-20)/scale,ymax-(q.y-20)/scale];
 if(!ParallelPara.pointInPoly(world,data.boundary)){roadMessage('Choose a point inside the site.');return;}
 cancelRoad();roadEntrance=world;roadPicking=false;draw();roadMessage('Entrance arrival point selected. Click Generate circulation.');
};
$('generateRoads').onclick=()=>{
 if(busy||fittingBusy||roadWorker)return;
 const input=JSON.parse(JSON.stringify(roadInput()));let url;
 try{
  Circulation.settings(input.settings);
  const job=++roadJob,key=data.layouts[index],fingerprint=Circulation.fingerprint(input);
  url=URL.createObjectURL(new Blob([roadWorkerSource],{type:'text/javascript'}));roadWorker=new Worker(url);URL.revokeObjectURL(url);url=null;
  $('generateRoads').disabled=true;$('cancelRoads').disabled=false;roadMessage('Checking rear access and connecting lanes…');
  roadWorker.onmessage=e=>{
   if(job!==roadJob)return;
   if(e.data.progress){const p=e.data.progress;roadMessage(`${p.stage} · ${p.completed}/${p.total} arrival points connected`);return;}
   const response=e.data;cancelRoad();
   if(response.error){roadMessage('Circulation failed: '+response.error+' Previous result kept.');return;}
   if(key!==data.layouts[index]||fingerprint!==Circulation.fingerprint(roadInput())){roadMessage('Inputs changed during calculation; result discarded.');return;}
   roadResults.set(key,response.result);$('roadOverlay').checked=true;draw();
  };
  roadWorker.onerror=e=>{cancelRoad();roadMessage('Circulation failed: '+e.message+' Previous result kept.');};
  roadWorker.postMessage(input);
 }catch(e){if(url)URL.revokeObjectURL(url);cancelRoad();roadMessage(e.message+' Previous result kept.');}
};
$('cancelRoads').onclick=()=>{cancelRoad();roadMessage('Circulation cancelled. Previous result kept.');};
for(const id of ['roadWidth','roadEdge','arrivalWidth'])$(id).onchange=()=>{cancelRoad();draw();};
for(const id of ['roadOverlay','roadReservations'])$(id).onchange=()=>draw();
$('exportRoads').onclick=()=>{
 const result=roadResults.get(data.layouts[index]);if(!result){roadMessage('Generate circulation before exporting.');return;}
 const payload={...result,stale:result.fingerprint!==Circulation.fingerprint(roadInput())};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='circulation-study.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
