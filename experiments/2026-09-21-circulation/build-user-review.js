// Reproduce the supplied layout/activation/entrance without touching saved viewer data.
const fs=require('node:fs');
const root='experiments/2026-09-21-circulation';
const exported=JSON.parse(fs.readFileSync(root+'/inputs/'+(process.argv[2]||'user-rejected-network.json'),'utf8')),input=JSON.parse(exported.fingerprint);
const data=JSON.parse(fs.readFileSync('output/checks/image-flow-3d-20260915/report.json','utf8'));
data.boundary=input.boundary;data.contours=input.contours;
data.layouts=[{...input.layout,units:input.layout.units.map((u,i)=>({...u,active:input.active[i],z:input.z[i]}))}];
let html=fs.readFileSync('output/checks/image-flow-3d-20260915/index.html','utf8');
html=html.replace(/\r\n/g,'\n');
if(!/const data=[\s\S]*?;\nconst data0=/.test(html)||!html.includes('reset();\n</script>'))throw Error('Viewer markers changed; review fixture not written.');
html=html.replace(/const data=[\s\S]*?;\nconst data0=/,()=>`const data=${JSON.stringify(data)};\nconst data0=`);
html=html.replace('<h1>Villa study</h1>','<h1>Your saved circulation layout</h1>');
const init=`reset();\nroadEntrance=${JSON.stringify(input.entrance)};\n$('roadWidth').value=${JSON.stringify(String(input.settings.width))};\n$('roadMaxSlope').value=${JSON.stringify(String(process.argv[2]?input.settings.maxSlope:100))};\n$('roadEdge').value=${JSON.stringify(String(input.settings.edge||0))};\n$('arrivalWidth').value=${JSON.stringify(String(input.settings.entranceWidth))};\n$('backClear').value=${JSON.stringify(String(input.settings.backClear))};\nsmoothLevel=${JSON.stringify(input.guidance||0)};\n$('smooth').value=smoothLevel;$('smoothVal').textContent=smoothLevel;\ndraw();\n</script>`;
html=html.replace('reset();\n</script>',()=>init);
fs.writeFileSync(root+'/checks/user-layout-review.html',html);
console.log('Saved user-layout-review.html: original geometry, activation, pads and entrance; slope from supplied study (default fixture: 100%).');
