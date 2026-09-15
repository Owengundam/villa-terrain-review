"""Export exact proposed footprints as image-generation reference drawings."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
report = json.loads((root / 'output/checks/view-elevation/20260914-152538/report.json').read_text(encoding='utf-8'))
out = root / 'output/previews/phase2-plan-renders'
out.mkdir(exist_ok=True)
for row in report['studies']:
    source, state = row['source'], row['result']['best']
    option = source['name'].split(' /')[0].split('_')[-1]
    boundary = source['boundary']
    xs, ys = zip(*boundary)
    scale = min(1060/(max(xs)-min(xs)), 1060/(max(ys)-min(ys)))
    cx, cy = (min(xs)+max(xs))/2, (min(ys)+max(ys))/2
    def xy(p): return (600+(p[0]-cx)*scale, 620-(p[1]-cy)*scale)
    im = Image.new('RGB',(1200,1200),'#faf8f1')
    draw = ImageDraw.Draw(im)
    draw.polygon([xy(p) for p in boundary], fill='#e7eacb')
    for contour in source['contours']:
        draw.line([xy(p) for p in contour['points']], fill='#c8cbb2',width=1)
    draw.line([xy(p) for p in boundary+[boundary[0]]],fill='#d95a4f',width=3)
    for u,p in zip(source['units'],state['polys']):
        color = '#fffffa' if u['name'].startswith('V') else '#eee6ce'
        draw.polygon([xy(q) for q in p],fill=color,outline='#364537',width=3)
        c = [sum(q[k] for q in p)/len(p) for k in (0,1)]
        draw.text(xy(c),u['name'],fill='#364537',anchor='mm')
    draw.text((35,30),option+' | PHASE 2 PROPOSED PLAN',fill='#364537',font_size=25)
    im.save(out/(option+'-geometry-guide.png'))
    print(out/(option+'-geometry-guide.png'))
