"""Build a self-contained viewer and static PNGs from verified reconstructed geometry."""
import json,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/checks/image-reduction-20260915'
if '--folder' in sys.argv:OUT=ROOT/sys.argv[sys.argv.index('--folder')+1]
report=json.loads((OUT/'report.json').read_text(encoding='utf8'))
data={k:report[k] for k in ('boundary','contours','rules','layouts')}
for l in data['layouts']:
    for k in ('source_image','registration','history','verification'):l.pop(k,None)
fragment=(ROOT/'phase0/reduction_view.html').read_text(encoding='utf8').replace('/*__MODEL__*/',(ROOT/'phase0/reduction_model.js').read_text(encoding='utf8')).replace('/*__DATA__*/',json.dumps(data,separators=(',',':')))
fragment=fragment.replace('/*__ELEVATIONS__*/',(ROOT/'phase0/elevation_diagrams.js').read_text(encoding='utf8'))
fragment=fragment.replace('/*__PRESENTATION__*/',(ROOT/'phase0/villa_presentation.js').read_text(encoding='utf8'))
style='body{margin:0;background:#f1f5f7}button,select{font:inherit}button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #419aab;outline-offset:3px}'
(OUT/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Villa reduction</title><style>'+style+'</style><body>'+fragment+'</body></html>',encoding='utf8')
if '--site-only' not in sys.argv:
    vis=Path('C:/Users/h2/.codex/visualizations/2026/09/14/01a09dc8-c4d5-7090-b28d-30fa98335b7f/villa-reduction.html');vis.write_text(fragment,encoding='utf8')
for l in data['layouts']:
    im=Image.new('RGB',(1300,1600),'white');d=ImageDraw.Draw(im);font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
    xs=[p[0] for p in data['boundary']];ys=[p[1] for p in data['boundary']];scale=min(1180/(max(xs)-min(xs)),1400/(max(ys)-min(ys)))
    def points(ps):return [(60+(x-min(xs))*scale,90+(max(ys)-y)*scale) for x,y,*_ in ps]
    for c in data['contours']:d.line(points(c['points']),fill='#d6ded5',width=1)
    d.line(points(data['boundary']+[data['boundary'][0]]),fill='#20362f',width=3)
    for u in [u for u in l['units'] if u['active']]:
        ps=points(u['points']);d.polygon(ps,fill='#b7d2bb' if u['active'] else '#f1f1ee',outline='#43896a' if u['active'] else '#c6c6c2',width=2)
        if u['active']:
            c=points([u['center']])[0];d.text(c,u['id'],fill='#20362f',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',13),anchor='mm')
            v=u['view'];s=(v[1],-v[0]);tip=points([[u['center'][0]+v[0]*9,u['center'][1]+v[1]*9]])[0]
            d.line([c,tip],fill='#20362f',width=2)
            arrow=[[u['center'][0]+v[0]*a+s[0]*b,u['center'][1]+v[1]*a+s[1]*b] for a,b in [(9,0),(6,1.3),(6,-1.3)]]
            d.polygon(points(arrow),fill='#20362f')
    d.text((60,25),f"{l['name']}  |  {l['retained_count']} / {l['initial_count']} active  |  VERIFIED",font=font,fill='#20362f')
    d.text((60,1530),'11 x 23 m | Arrows: downhill | Auto pads: +/-1.5 m | Active villas only',font=font,fill='#20362f')
    im.save(OUT/(l['name']+'-reduced.png'))
print('Viewer bytes:',len(fragment.encode('utf8')))
print(OUT/'index.html')
