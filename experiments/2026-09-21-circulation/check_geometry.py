"""Independent Shapely check of exported browser-test road envelopes."""
import json
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point

root = Path(__file__).resolve().parent
d = json.loads((root/'checks/browser-network.json').read_text(encoding='utf-8'))
snapshot = json.loads(d['fingerprint'])
site = Polygon(snapshot['boundary'])
violations = []
for road in d['roads']:
    points = road['points']
    radius = road['width']/2 + (0 if road['kind']=='entrance' else d['settings']['edge'])
    geom = Point(points[0]) if len(points)==1 else LineString(points)
    envelope = geom.buffer(radius, cap_style='flat' if road['kind']=='entrance' else 'round', quad_segs=32)
    outside = envelope.difference(site).area
    if outside > 0.005:
        violations.append([road['id'], 'boundary', outside])
    for unit in snapshot['layout']['units']:
        if road['kind']=='entrance' and road['a']==unit['id']:
            continue
        overlap = envelope.intersection(Polygon(unit['points'])).area
        if overlap > 0.005:
            violations.append([road['id'], unit['id'], overlap])
summary = dict(connected=d['connected'], total=d['total'], testEntrance=snapshot['entrance'],
               roads=len(d['roads']), shapelyRebuiltEnvelopeViolations=violations,
               areaToleranceSquareMetres=0.005, terrainAndVehicleChecks='not evaluated',
               note='Temporary browser-test interior arrival point, not an approved project entrance.')
(root/'checks/independent-geometry.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
assert not violations
