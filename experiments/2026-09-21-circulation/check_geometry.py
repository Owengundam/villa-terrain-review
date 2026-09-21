"""Independent Shapely check of exported browser-test road envelopes."""
import json
import sys
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point

root = Path(__file__).resolve().parent
name = sys.argv[1] if len(sys.argv)>1 else 'browser-network.json'
d = json.loads((root/'checks'/name).read_text(encoding='utf-8'))
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
    for i, unit in enumerate(snapshot['layout']['units']):
        if d.get('version',1)>=2 and not (snapshot['active'][i] if 'active' in snapshot else unit.get('active',True)):
            continue
        if road['kind']=='entrance' and road['a']==unit['id']:
            continue
        overlap = envelope.intersection(Polygon(unit['points'])).area
        if overlap > 0.005:
            violations.append([road['id'], unit['id'], overlap])
slope_violations=[]
max_grade=0
slope_checked=d.get('version',1)>=2 and d['settings'].get('checkSlope',True)
if slope_checked:
    for road in d['roads']:
        samples=road['profile']['samples']
        for a,b in zip(samples,samples[1:]):
            distance=((b['x']-a['x'])**2+(b['y']-a['y'])**2)**0.5
            assert 0 < distance <= 0.500001
            grade=100*abs(b['z']-a['z'])/distance
            max_grade=max(max_grade,grade)
            if grade>d['settings']['maxSlope']+1e-7:
                slope_violations.append([road['id'],grade])
summary = dict(connected=d['connected'], total=d['total'], testEntrance=snapshot['entrance'],
               roads=len(d['roads']), shapelyRebuiltEnvelopeViolations=violations,
               areaToleranceSquareMetres=0.005, exportedProfileSlopeViolations=slope_violations,
               maximumRecomputedGrade=max_grade if slope_checked else None,
               terrainAndVehicleChecks='sampled ground-following longitudinal grade only' if slope_checked else 'not evaluated',
               note='Saved user study entrance.' if name.startswith('fixed-') else 'Temporary browser-test interior arrival point, not an approved project entrance.')
(root/'checks'/('independent-'+Path(name).stem+'.json' if name.startswith('fixed-') else 'independent-slope-geometry.json' if d.get('version',1)>=2 else 'independent-geometry.json')).write_text(json.dumps(summary,indent=2),encoding='utf-8')
print(json.dumps(summary,indent=2))
assert not violations
assert not slope_violations
