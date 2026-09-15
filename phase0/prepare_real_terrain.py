"""Build an explicitly documented reference field from live elevation labels."""
import json,math,sys
from pathlib import Path
path=Path(sys.argv[1]);data=json.loads(path.read_text(encoding='utf8'))
boundary=data['boundary']['points'];spots=data['spots'];spacing=4.
x0=min(p[0] for p in boundary);y0=min(p[1] for p in boundary)
nx=math.ceil((max(p[0] for p in boundary)-x0)/spacing)+1;ny=math.ceil((max(p[1] for p in boundary)-y0)/spacing)+1
def sample(x,y):
    near=sorted((((s['point'][0]-x)**2+(s['point'][1]-y)**2,s['z']) for s in spots))[:8]
    if near[0][0]<1e-12:return near[0][1]
    return sum(z/d for d,z in near)/sum(1/d for d,z in near)
grid=[[sample(x0+i*spacing,y0+j*spacing) for i in range(nx)] for j in range(ny)]
source=dict(name='Live survey site',boundary=boundary,contours=data['contours'],units=[data['unit']])
report=dict(path=data['path'],source_fingerprint=data['fingerprint'],raw_source=str(path),reference='Live elevation labels interpolated by 8-neighbour inverse-distance squared weighting on a 4 m grid; label insertion anchors approximate spot XY. Orientation follows live tagged smoothed/inferred contours.',studies=[dict(source=source,terrain=dict(x0=x0,y0=y0,spacing=spacing,grid=grid))])
out=path.with_name(path.stem+'-reference.json');out.write_text(json.dumps(report),encoding='utf8');print(out)
