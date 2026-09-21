"""Diagnostic only: fixed saved layouts, straight links between rear-band centres.
Widths are sensitivity assumptions, not adopted project parameters.
Does not search for routes or establish terrain/vehicle feasibility.
"""
import json
from pathlib import Path
from collections import defaultdict
from shapely.geometry import Polygon, LineString

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parents[1] / 'checks'
OUT.mkdir(exist_ok=True)
source = ROOT / 'experiments/2026-09-21-parallel-capacity'
site = json.loads((source / 'inputs/site-report.json').read_text(encoding='utf-8'))
boundary = Polygon(site['boundary'])
results = []
for level in [0, 2]:
    layout = json.loads((source / f'checks/after-{level}.json').read_text(encoding='utf-8'))
    units = layout['units']
    footprints = {u['id']: Polygon(u['points']) for u in units}
    rows = defaultdict(list)
    strips = []
    clipped = []
    for u in units:
        rows[u['row']].append(u)
        x,y = u['center']; vx,vy = u['view']; sx,sy = vy,-vx
        corners = [(x-vx*d+sx*w,y-vy*d+sy*w) for d,w in [(11.5,-5.5),(11.5,5.5),(18.5,5.5),(18.5,-5.5)]]
        strip = Polygon(corners)
        strips.append(strip)
        if strip.difference(boundary).area > 1e-6:
            clipped.append(u['id'])
    cases=[]
    for width in [3,4,5]:
        links=[]
        for row, members in rows.items():
            members.sort(key=lambda u:u['order'])
            for a,b in zip(members,members[1:]):
                points=[(u['center'][0]-15*u['view'][0],u['center'][1]-15*u['view'][1]) for u in [a,b]]
                line=LineString(points)
                road=line.buffer(width/2,cap_style='flat',join_style='round')
                hits=[uid for uid,p in footprints.items() if road.intersection(p).area>1e-6]
                outside=road.difference(boundary).area
                links.append(dict(row=row,a=a['id'],b=b['id'],length=round(line.length,3),buildingHits=hits,outsideArea=round(outside,5),passXY=not hits and outside<=1e-6))
        cases.append(dict(widthAssumption=width,links=len(links),passXY=sum(l['passXY'] for l in links),blocked=sum(not l['passXY'] for l in links),details=links))
    results.append(dict(level=level,villas=len(units),occupiedRows=len(rows),singleVillaRows=sum(len(r)==1 for r in rows.values()),rearStripsOutsideBoundary=clipped,cases=cases))
report=dict(method=__doc__,siteArea=boundary.area,bbox=boundary.bounds,contourCount=len(site['contours']),contourRange=[min(c['z'] for c in site['contours']),max(c['z'] for c in site['contours'])],results=results)
(OUT/'audit.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({**{k:v for k,v in report.items() if k!='results'},'results':[{**{k:v for k,v in r.items() if k!='cases'},'cases':[{k:v for k,v in c.items() if k!='details'} for c in r['cases']]} for r in results]},indent=2))
