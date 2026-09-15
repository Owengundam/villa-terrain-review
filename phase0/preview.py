"""Exact geometry review images, not generated landscape illustrations."""
from PIL import Image,ImageDraw
import html

def render(report,dest):
    cards=[]
    for k,r in enumerate(report['strategies']):
        if r['status']!='verified':continue
        s=r['source'];ps=r['state']['polys'];boundary=s['boundary']
        xs,ys=zip(*boundary);scale=min(1120/(max(xs)-min(xs)),1000/(max(ys)-min(ys)))
        cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2
        def xy(p):return (650+(p[0]-cx)*scale,650-(p[1]-cy)*scale)
        im=Image.new('RGB',(1300,1260),'#faf8f1');d=ImageDraw.Draw(im)
        d.text((40,25),r['name']+' | '+str(len(ps))+' villas',fill='#284737',font_size=32)
        d.text((40,75),'Local contour-normal orientation | verified clearance + elevations',fill='#284737',font_size=20)
        d.polygon([xy(p) for p in boundary],fill='#e5eacb')
        for c in s['contours']:d.line([xy(p) for p in c['points']],fill='#bbc9ae',width=1)
        d.line([xy(p) for p in boundary+[boundary[0]]],fill='#b45e50',width=3)
        for u,p,z in zip(s['units'],ps,r['state']['z']):
            d.polygon([xy(q) for q in p],fill='#fffef4',outline='#36563d',width=2)
            c=[sum(q[j] for q in p)/len(p) for j in [0,1]];x,y=xy(c)
            d.text((x,y-7),u['name'],fill='#284737',anchor='mm',font_size=11)
            d.text((x,y+8),'%.1fm'%z,fill='#284737',anchor='mm',font_size=11)
        filename=['parallel','staggered'][k]+'.png';im.save(dest/filename)
        cards.append('<section><h2>'+html.escape(r['name'])+'</h2><p>'+str(len(ps))+' villas · row pitch '+str(r['row_pitch'])+' m · all checks passed</p><img src="'+filename+'"></section>')
    (dest/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Phase 0 villa layouts</title><style>body{font:16px system-ui;background:#faf8f1;color:#284737;margin:30px}main{display:flex;flex-wrap:wrap;gap:24px}section{flex:1;min-width:320px}img{width:100%}</style><h1>Phase 0 · terrain-led villa layouts</h1><p>Exact footprints and pad levels. '+html.escape(report['reference'])+'</p><p>Landscape, roads and final terrain are not designed.</p><main>'+''.join(cards)+'</main>',encoding='utf8')
