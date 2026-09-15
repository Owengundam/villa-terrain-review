"""Add a boundary-trimmed reference terrain mesh to the villa study."""
import os,sys,json,datetime
import Rhino,System
from System.Drawing import Color
doc=__rhino_doc__;root=os.path.dirname(doc.Path)
while not os.path.isfile(os.path.join(root,'phase0','run.py')):
    parent=os.path.dirname(root)
    if parent==root:raise ValueError('Workspace not found')
    root=parent
sys.path.insert(0,os.path.join(root,'view_elevation'))
from core import Terrain
folder=os.path.join(root,'output','checks','phase0','20260914-181521')
with open(os.path.join(folder,'report.json'),encoding='utf8') as f:report=json.load(f)
with open(os.path.join(root,report['source']),encoding='utf8') as f:source=json.load(f)
t=Terrain.__new__(Terrain)
for k,v in source['studies'][0]['terrain'].items():setattr(t,k,v)
t.ny=len(t.grid);t.nx=len(t.grid[0])
boundary=source['studies'][0]['source']['boundary']
points=[Rhino.Geometry.Point3d(p[0],p[1],0) for p in boundary];points.append(points[0])
curve=Rhino.Geometry.PolylineCurve(points)
breps=Rhino.Geometry.Brep.CreatePlanarBreps(curve,.001)
if not breps:raise ValueError('Site boundary cannot form a planar face')
settings=Rhino.Geometry.MeshingParameters();settings.MaximumEdgeLength=3.;settings.MinimumEdgeLength=.1;settings.RefineGrid=True;settings.GridMinCount=100
mesh=Rhino.Geometry.Mesh()
for b in breps:
    for part in Rhino.Geometry.Mesh.CreateFromBrep(b,settings):mesh.Append(part)
mesh.Faces.ConvertQuadsToTriangles()
for i in range(mesh.Vertices.Count):
    p=mesh.Vertices[i];mesh.Vertices.SetVertex(i,p.X,p.Y,t.sample((p.X,p.Y)))
mesh.Normals.ComputeNormals();mesh.Compact()
if not mesh.IsValid or mesh.Faces.Count==0:raise ValueError('Invalid site mesh')
stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
layer=Rhino.DocObjects.Layer();layer.Name='PHASE0_STAGGERED_SITE_MESH_'+stamp;layer.Color=Color.FromArgb(157,180,133)
li=doc.Layers.Add(layer)
attr=Rhino.DocObjects.ObjectAttributes();attr.LayerIndex=li;attr.Name='Site terrain - elevation-label reference';attr.SetUserString('TerrainSource',report['source']);attr.SetUserString('Note','Interpolated reference surface; not graded to villa pads')
existing=next((o for o in doc.Objects if o.Attributes.Name==attr.Name and o.Attributes.GetUserString('TerrainSource')==report['source'] and isinstance(o.Geometry,Rhino.Geometry.Mesh)),None)
oid=existing.Id if existing else doc.Objects.AddMesh(mesh,attr)
if oid==System.Guid.Empty:raise RuntimeError('Cannot add terrain mesh')
oldpath=os.path.join(folder,'staggered-villas-20260914-182545.3dm')
model=Rhino.FileIO.File3dm.Read(oldpath)
if model is None:raise RuntimeError('Cannot read villa model')
ml=Rhino.DocObjects.Layer();ml.Name='Site reference terrain';ml.Color=layer.Color
model.Layers.Add(ml);ma=attr.Duplicate();ma.LayerIndex=model.Layers.Count-1;model.Objects.AddMesh(mesh,ma)
path=os.path.join(folder,'staggered-villas-with-site-'+stamp+'.3dm')
if not model.Write(path,8):raise RuntimeError('Cannot save combined model')
check=Rhino.FileIO.File3dm.Read(path)
assert any(isinstance(o.Geometry,Rhino.Geometry.Mesh) and o.Geometry.IsValid for o in check.Objects)
doc.Views.Redraw()
print(json.dumps(dict(path=path,mesh_id=str(oid),vertices=mesh.Vertices.Count,faces=mesh.Faces.Count,valid=mesh.IsValid,reference_only=True)))
