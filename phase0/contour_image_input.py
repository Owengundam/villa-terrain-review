"""Image generation input: boundary and elevation-labelled contours only."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'output/checks/phase0/real-terrain-20260914-180335.json').read_text(encoding='utf8'))
b=data['boundary']['points'];xs,ys=zip(*b);scale=min(1100/(max(xs)-min(xs)),1100/(max(ys)-min(ys)));cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
def xy(p):return (650+(p[0]-cx)*scale,650-(p[1]-cy)*scale)
im=Image.new('RGB',(1300,1300),'#faf9f4');d=ImageDraw.Draw(im)
d.polygon([xy(p) for p in b],fill='#eef0df')
for c in data['contours']:
    d.line([xy(p) for p in c['points']],fill='#839879',width=2)
    p=c['points'][len(c['points'])//2];d.text(xy(p),'%.0f m'%c['z'],fill='#465b40',font_size=15)
d.line([xy(p) for p in b+[b[0]]],fill='#c35c51',width=3)
folder=root/'output/previews/ai-terrain-layout';folder.mkdir(exist_ok=True)
im.save(folder/'site-contours-only.png')
