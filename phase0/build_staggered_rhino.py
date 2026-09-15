"""Add and save the verified staggered proposal as 5 m villa massing."""
import os,json,datetime
import Rhino,System
from System.Drawing import Color
doc=__rhino_doc__
root=os.path.dirname(doc.Path)
while not os.path.isfile(os.path.join(root,'phase0','run.py')):
    parent=os.path.dirname(root)
    if parent==root:raise ValueError('Workspace not found')
    root=parent
folder=os.path.join(root,'output','checks','phase0','20260914-181521')
with open(os.path.join(folder,'report.json'),encoding='utf8') as f:report=json.load(f)
r=next(r for r in report['strategies'] if r['name']=='Staggered rows')
assert r['status']=='verified' and r['verification']['passed'] and r['verification']['orientation_passed']
assert not r['verification']['clearance_cleanup_issues']
if doc.ModelUnitSystem!=Rhino.UnitSystem.Meters:raise ValueError('Rhino document must use metres')
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S');title='PHASE0_STAGGERED_21_'+stamp
model=Rhino.FileIO.File3dm();model.Settings.ModelUnitSystem=Rhino.UnitSystem.Meters
model.Settings.ModelAbsoluteTolerance=.001
originals={str(o.Id):o.Geometry.DataCRC(0) for o in doc.Objects}
added=[];layerids=[];solids=[]
undo=doc.BeginUndoRecord('Create staggered villa massing')
try:
    for name,color in [('Villas',Color.FromArgb(190,209,180)),('Pad labels',Color.FromArgb(40,65,50)),('Reference contours',Color.FromArgb(115,145,110))]:
        layer=Rhino.DocObjects.Layer();layer.Name=title+'_'+name;layer.Color=color
        li=doc.Layers.Add(layer);layerids.append(li)
        copy=Rhino.DocObjects.Layer();copy.Name=name;copy.Color=color;model.Layers.Add(copy)
    def add(geo,layer,name,tags=None):
        attr=Rhino.DocObjects.ObjectAttributes();attr.LayerIndex=layerids[layer];attr.Name=name
        attr.SetUserString('Phase0Source','20260914-181521');attr.SetUserString('Representation','5 m conceptual massing')
        for k,v in (tags or {}).items():attr.SetUserString(k,str(v))
        oid=doc.Objects.Add(geo,attr)
        if oid==System.Guid.Empty:raise RuntimeError('Rhino object creation failed')
        added.append(oid);exportattr=attr.Duplicate();exportattr.LayerIndex=layer;model.Objects.Add(geo,exportattr)
        return oid
    for u,z in zip(r['source']['units'],r['state']['z']):
        pts=[Rhino.Geometry.Point3d(p[0],p[1],z) for p in u['points']];pts.append(pts[0])
        curve=Rhino.Geometry.PolylineCurve(pts);ext=Rhino.Geometry.Extrusion.Create(curve,5.,True)
        if ext is None:raise RuntimeError('Cannot extrude '+u['name'])
        brep=ext.ToBrep()
        if not brep.IsValid or not brep.IsSolid:raise RuntimeError('Invalid solid')
        volume=Rhino.Geometry.VolumeMassProperties.Compute(brep).Volume
        if abs(volume-11*23*5)>.01:raise RuntimeError('Unexpected villa volume')
        oid=add(brep,0,u['name'],dict(PadElevation=z,Height=5,ViewX=u['view'][0],ViewY=u['view'][1],ClearViewFraction=r['state']['clear_fraction'][len(solids)]));solids.append(oid)
        c=curve.GetBoundingBox(True).Center
        add(Rhino.Geometry.TextDot(u['name']+' | %.2f m'%z,Rhino.Geometry.Point3d(c.X,c.Y,z+5.2)),1,u['name']+' level')
    for contour in r['source']['contours']:
        pts=[Rhino.Geometry.Point3d(p[0],p[1],contour['z']) for p in contour['points']]
        add(Rhino.Geometry.PolylineCurve(pts),2,'Contour %.1f m'%contour['z'])
    for oid,crc in originals.items():
        obj=doc.Objects.FindId(System.Guid(oid))
        if obj is None or obj.Geometry.DataCRC(0)!=crc:raise RuntimeError('Existing geometry changed')
    path=os.path.join(folder,'staggered-villas-'+stamp+'.3dm')
    if not model.Write(path,8):raise RuntimeError('Standalone model save failed')
    reopened=Rhino.FileIO.File3dm.Read(path)
    if len([o for o in reopened.Objects if isinstance(o.Geometry,Rhino.Geometry.Brep) and o.Geometry.IsSolid])!=21:raise RuntimeError('Saved solid count mismatch')
    doc.Groups.Add(title,added)
    doc.Objects.UnselectAll()
    for oid in solids:doc.Objects.Select(oid)
    box=Rhino.Geometry.BoundingBox.Unset
    for oid in solids:box.Union(doc.Objects.FindId(oid).Geometry.GetBoundingBox(True))
    view=doc.Views.ActiveView
    if view:
        view.ActiveViewport.SetProjection(Rhino.Display.DefinedViewportProjection.Perspective,'Phase 0 staggered',True)
        view.ActiveViewport.ZoomBoundingBox(box)
    doc.Views.Redraw()
    result=dict(model=path,solids=len(solids),objects=len(added),group=title,source_geometry_unchanged=True)
    with open(os.path.join(folder,'rhino-build-'+stamp+'.json'),'w',encoding='utf8') as f:json.dump(result,f,indent=2)
    print(json.dumps(result))
except:
    for oid in added:doc.Objects.Delete(oid,True)
    raise
finally:doc.EndUndoRecord(undo)
