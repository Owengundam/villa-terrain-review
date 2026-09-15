"""Port-2000 read-only export: current building layouts and actual 3D contours."""
import os,sys,json,datetime
import Rhino
doc=__rhino_doc__
root=os.path.dirname(doc.Path)
while not os.path.isfile(os.path.join(root,'phase2','model_geometry.py')):
    parent=os.path.dirname(root)
    if parent==root: raise ValueError('Planning workspace not found')
    root=parent
sys.path.insert(0,os.path.join(root,'phase2'))
import model_geometry,geometry as g
before=model_geometry.fingerprint(doc)
data=model_geometry.snapshot(doc)
for study in data['studies']: study['contours']=[]
for obj in doc.Objects:
    layer=doc.Layers[obj.Attributes.LayerIndex].FullPath
    if '::02_CONTOURS_3D_TRUE_Z' not in layer or not isinstance(obj.Geometry,Rhino.Geometry.Curve): continue
    option=layer.split('::')[-2]
    candidates=[s for s in data['studies'] if s['name'].startswith(option+' /')]
    if not candidates: continue
    ok,poly=obj.Geometry.TryGetPolyline()
    if not ok:
        poly=obj.Geometry.ToPolyline(.01,.03,0,5).ToPolyline()
    pts=[[p.X,p.Y,p.Z] for p in poly]
    if len(pts)<2: continue
    if max(p[2] for p in pts)-min(p[2] for p in pts)>.02: raise ValueError('Non-level contour '+str(obj.Id))
    c=g.center(pts)
    ranked=sorted((g.length(g.sub(c,g.center(s['boundary']))),i) for i,s in enumerate(candidates))
    if len(ranked)>1 and ranked[1][0]-ranked[0][0]<1: raise ValueError('Ambiguous terrain-copy association')
    owner=candidates[ranked[0][1]]
    owner['contours'].append(dict(z=sum(p[2] for p in pts)/len(pts),points=[p[:2] for p in pts],id=str(obj.Id)))
for study in data['studies']:
    if len(set(round(c['z'],2) for c in study['contours']))<3: raise ValueError(study['name']+': insufficient 3D reference contours')
assert model_geometry.fingerprint(doc)==before
folder=os.path.join(root,'output','checks','view-elevation'); os.makedirs(folder,exist_ok=True)
path=os.path.join(folder,'input-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
with open(path,'w',encoding='utf-8') as f: json.dump(data,f)
print(json.dumps(dict(path=path,unchanged=True,studies=[dict(name=s['name'],buildings=len(s['units']),contours=len(s['contours'])) for s in data['studies']])))
