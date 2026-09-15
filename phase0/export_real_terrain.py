"""Export live plan contours with tagged levels and spot-elevation text anchors."""
import os,sys,json,datetime,math
import Rhino
doc=__rhino_doc__
root=os.path.dirname(doc.Path)
while not os.path.isfile(os.path.join(root,'phase0','run.py')):root=os.path.dirname(root)
sys.path.insert(0,os.path.join(root,'phase2'))
import model_geometry,geometry as g
before=model_geometry.fingerprint(doc)
contours=[];spots=[];boundaries=[]
def points(curve):
    ok,p=curve.TryGetPolyline()
    if ok:return [[q.X,q.Y] for q in p]
    ts=curve.DivideByCount(max(8,int(math.ceil(curve.GetLength()/1.))),True)
    return [[curve.PointAt(t).X,curve.PointAt(t).Y] for t in ts]
for obj in doc.Objects:
    layer=doc.Layers[obj.Attributes.LayerIndex].FullPath;geo=obj.Geometry
    if layer=='02 Contours::Smooth contours - plan - 1m' and isinstance(geo,Rhino.Geometry.Curve):
        level=obj.Attributes.GetUserString('Elevation_m')
        if level is None:raise ValueError('Contour missing Elevation_m')
        contours.append(dict(id=str(obj.Id),z=float(level),points=points(geo)))
    if layer=='01 Site::Spot elevations' and isinstance(geo,Rhino.Geometry.TextEntity):
        try:z=float(geo.PlainText)
        except:continue
        p=geo.Plane.Origin;spots.append(dict(id=str(obj.Id),point=[p.X,p.Y],z=z))
    if layer=='01 Site::Boundary' and isinstance(geo,Rhino.Geometry.Curve) and geo.IsClosed:
        ps=points(geo)
        if g.length(g.sub(ps[0],ps[-1]))<.01:ps=ps[:-1]
        boundaries.append(dict(id=str(obj.Id),points=ps))
if not contours or not spots or not boundaries:raise ValueError('Missing live terrain inputs')
for b in boundaries:b['spot_count']=sum(g.inside(s['point'],b['points']) for s in spots)
boundaries.sort(key=lambda b:b['spot_count'],reverse=True)
boundaries=list({tuple(tuple(p) for p in b['points']):b for b in reversed(boundaries)}.values())
boundaries.sort(key=lambda b:b['spot_count'],reverse=True)
if len(boundaries)>1 and boundaries[0]['spot_count']==boundaries[1]['spot_count']:
    with open(os.path.join(root,'output','checks','phase0','boundary-inspection.json'),'w') as f:json.dump([dict(id=b['id'],count=b['spot_count'],area=abs(g.signed_area(b['points'])),center=g.center(b['points']),points=b['points']) for b in boundaries],f)
    raise ValueError('Ambiguous site boundary')
snapshot=model_geometry.snapshot(doc);unit=next(u for s in snapshot['studies'] for u in s['units'] if u['name'].startswith('V'))
data=dict(path=doc.Path,fingerprint=before,boundary=boundaries[0],contours=contours,spots=spots,unit=unit,spot_location='Text plane insertion anchors; no separate survey point geometry on this layer')
assert before==model_geometry.fingerprint(doc)
folder=os.path.join(root,'output','checks','phase0');os.makedirs(folder,exist_ok=True)
path=os.path.join(folder,'real-terrain-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
with open(path,'w',encoding='utf8') as f:json.dump(data,f)
print(json.dumps(dict(path=path,contours=len(contours),spots=len(spots),boundary=boundaries[0]['id'],inside_spots=boundaries[0]['spot_count'],bounds=[min(s['z'] for s in spots),max(s['z'] for s in spots)],unchanged=True)))
