"""Add exact-footprint horizontal pad surfaces at accepted villa levels."""
import os,json,datetime
import Rhino,System
from System.Drawing import Color
doc=__rhino_doc__;root=os.path.dirname(doc.Path)
while not os.path.isfile(os.path.join(root,'phase0','run.py')):
    parent=os.path.dirname(root)
    if parent==root:raise ValueError('Workspace not found')
    root=parent
folder=os.path.join(root,'output','checks','phase0','20260914-181521')
with open(os.path.join(folder,'report.json'),encoding='utf8') as f:r=next(x for x in json.load(f)['strategies'] if x['name']=='Staggered rows')
model=Rhino.FileIO.File3dm.Read(os.path.join(folder,'staggered-villas-with-site-20260914-182740.3dm'))
if model is None:raise ValueError('Source model missing')
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S');layer=Rhino.DocObjects.Layer();layer.Name='PHASE0_VILLA_PADS_'+stamp;layer.Color=Color.FromArgb(210,188,151)
li=doc.Layers.Add(layer);exportlayer=Rhino.DocObjects.Layer();exportlayer.Name='Villa pads';exportlayer.Color=layer.Color;model.Layers.Add(exportlayer)
ids=[];undo=doc.BeginUndoRecord('Add villa pads')
try:
    for u,z in zip(r['source']['units'],r['state']['z']):
        pts=[Rhino.Geometry.Point3d(p[0],p[1],z) for p in u['points']];pts.append(pts[0])
        surfaces=Rhino.Geometry.Brep.CreatePlanarBreps(Rhino.Geometry.PolylineCurve(pts),.001)
        if not surfaces or len(surfaces)!=1 or not surfaces[0].IsValid:raise ValueError('Invalid pad '+u['name'])
        pad=surfaces[0];bounds=pad.GetBoundingBox(True)
        if abs(bounds.Min.Z-z)>.001 or abs(bounds.Max.Z-z)>.001:raise ValueError('Pad level mismatch')
        attr=Rhino.DocObjects.ObjectAttributes();attr.LayerIndex=li;attr.Name=u['name']+' pad';attr.SetUserString('PadElevation',str(z));attr.SetUserString('Villa',u['name']);attr.SetUserString('Note','Exact villa footprint; horizontal pad surface. Surrounding grading not included.')
        oid=doc.Objects.AddBrep(pad,attr)
        if oid==System.Guid.Empty:raise RuntimeError('Pad creation failed')
        ids.append(oid);ea=attr.Duplicate();ea.LayerIndex=model.Layers.Count-1;model.Objects.AddBrep(pad,ea)
    path=os.path.join(folder,'staggered-villas-site-pads-'+stamp+'.3dm')
    if not model.Write(path,8):raise RuntimeError('Save failed')
    saved=Rhino.FileIO.File3dm.Read(path)
    assert len([o for o in saved.Objects if o.Attributes.GetUserString('Villa')])==21
    doc.Groups.Add('PHASE0_PADS_'+stamp,ids);doc.Objects.UnselectAll()
    for oid in ids:doc.Objects.Select(oid)
    doc.Views.Redraw();print(json.dumps(dict(path=path,pads=len(ids),verified=True)))
except:
    for oid in ids:doc.Objects.Delete(oid,True)
    raise
finally:doc.EndUndoRecord(undo)
