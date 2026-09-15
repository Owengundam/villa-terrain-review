"""Run through port 2000. Mutates isolated headless fixtures, never the user's document."""
import os, sys, json, importlib, datetime
import Rhino, System
source=__rhino_doc__
root=os.path.dirname(source.Path)
while not os.path.isdir(os.path.join(root,'phase2')):
    parent=os.path.dirname(root)
    if parent==root: raise ValueError('Workspace not found')
    root=parent
sys.path.insert(0,os.path.join(root,'phase2'))
import geometry,checker,solver,model_geometry
for m in (geometry,checker,solver,model_geometry): importlib.reload(m)
source_hash=model_geometry.fingerprint(source)
out=os.path.join(root,'output','checks','phase2','integration-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
os.makedirs(out,exist_ok=True)
passed=[]

def fixture():
    doc=Rhino.RhinoDoc.CreateHeadless(None); doc.ModelUnitSystem=Rhino.UnitSystem.Meters; doc.ModelAbsoluteTolerance=.001
    parent=Rhino.DocObjects.Layer(); parent.Name='TEST_OPTION'; parent_index=doc.Layers.Add(parent)
    layers={}
    for name in ['01_BOUNDARY','05_MODULES','06_BUILDING_FILL','12_VIEW_DIRECTIONS','10_LABELS']:
        l=Rhino.DocObjects.Layer(); l.Name=name; l.ParentLayerId=doc.Layers[parent_index].Id; layers[name]=doc.Layers.Add(l)
    def attr(name,layer):
        a=Rhino.DocObjects.ObjectAttributes(); a.Name=name; a.LayerIndex=layers[layer]; return a
    G=Rhino.Geometry
    boundary=G.PolylineCurve([G.Point3d(-20,-20,0),G.Point3d(20,-20,0),G.Point3d(20,20,0),G.Point3d(-20,20,0),G.Point3d(-20,-20,0)])
    doc.Objects.AddCurve(boundary,attr('RT_BOUNDARY','01_BOUNDARY'))
    outline=G.PolylineCurve([G.Point3d(-2,-4,0),G.Point3d(2,-4,0),G.Point3d(2,4,0),G.Point3d(-2,4,0),G.Point3d(-2,-4,0)])
    definition=doc.InstanceDefinitions.Add('building','fixture',G.Point3d.Origin,[outline],[Rhino.DocObjects.ObjectAttributes()])
    for name,x in [('A',-2.5),('B',2.5)]:
        a=attr(name,'05_MODULES'); a.SetUserString('Function','villa')
        doc.Objects.AddInstanceObject(definition,G.Transform.Translation(x,0,7),a)
        mesh=G.Mesh()
        for px,py in [(-2,-4),(2,-4),(2,4),(-2,4)]: mesh.Vertices.Add(px+x,py,6.96)
        mesh.Faces.AddFace(0,1,2,3)
        doc.Objects.AddMesh(mesh,attr(name+' footprint fill','06_BUILDING_FILL'))
        doc.Objects.AddCurve(G.LineCurve(G.Point3d(x,4,7),G.Point3d(x,9,7)),attr(name+' main view','12_VIEW_DIRECTIONS'))
        text=G.TextEntity(); text.Plane=G.Plane(G.Point3d(x,0,7),G.Vector3d.ZAxis); text.PlainText=name
        doc.Objects.AddText(text,attr(name,'10_LABELS'))
    return doc

doc=fixture()
try:
    before=model_geometry.snapshot(doc); initial=model_geometry.fingerprint(doc)
    results=[solver.solve(s) for s in before['studies']]
    assert all(r['status']=='valid' for r in results)
    assert model_geometry.fingerprint(doc)==initial
    passed.append('Rhino extraction and dry run leave document unchanged')
    result=model_geometry.apply(doc,before,results,out,allow_headless=True)
    assert result['applied'] and os.path.isfile(result['backup']) and all(c['passed'] for c in result['checks'])
    passed.append('Apply moves blocks, meshes, arrows and labels; preserves IDs, attributes, orientation and Z')
    fresh=model_geometry.snapshot(doc)
    second=[solver.solve(s) for s in fresh['studies']]
    assert all(r['status']=='valid' and r['cost']==0 for r in second)
    passed.append('Second run is an unchanged zero-movement solution')
    try: model_geometry.apply(doc,before,results,out,allow_headless=True)
    except ValueError as e: assert 'changed' in str(e)
    else: raise AssertionError('Stale snapshot accepted')
    passed.append('Stale proposal refused')
finally: doc.Dispose()

doc=fixture()
try:
    before=model_geometry.snapshot(doc)
    results=[solver.solve(s,dict(max_move=0.)) for s in before['studies']]
    initial=model_geometry.fingerprint(doc)
    try: model_geometry.apply(doc,before,results,out,allow_headless=True)
    except ValueError as e: assert 'Unresolved' in str(e)
    else: raise AssertionError('Unresolved proposal applied')
    assert model_geometry.fingerprint(doc)==initial
    passed.append('Unresolved layout refused without geometry changes')
finally: doc.Dispose()

doc=fixture()
try:
    before=model_geometry.snapshot(doc); results=[solver.solve(s) for s in before['studies']]; initial=model_geometry.fingerprint(doc)
    initial_rows={str(o.Id):(o.Geometry.DataCRC(0),model_geometry.attribute_signature(o.Attributes)) for o in doc.Objects}
    original_verify=model_geometry.verify_rhino
    def forced_failure(*args): raise RuntimeError('Injected read-back failure')
    model_geometry.verify_rhino=forced_failure
    try:
        model_geometry.apply(doc,before,results,out,allow_headless=True)
    except RuntimeError as e: assert 'Injected' in str(e)
    else: raise AssertionError('Injected failure did not propagate')
    finally: model_geometry.verify_rhino=original_verify
    assert model_geometry.fingerprint(doc)==initial, str([(str(o.Id),initial_rows.get(str(o.Id)),(o.Geometry.DataCRC(0),model_geometry.attribute_signature(o.Attributes))) for o in doc.Objects if initial_rows.get(str(o.Id))!=(o.Geometry.DataCRC(0),model_geometry.attribute_signature(o.Attributes))])
    passed.append('Read-back failure rolls all changed geometry back')
finally: doc.Dispose()

assert model_geometry.fingerprint(source)==source_hash
passed.append('User document on port 2000 remains unchanged throughout integration tests')
# Exercise the real proposal on a saved headless copy, preserving the active document.
import glob
paths=sorted(glob.glob(os.path.join(root,'output','checks','phase2','*','report.json')),reverse=True)
matching=None
for path in paths:
    with open(path,encoding='utf-8') as f: candidate=json.load(f)
    if candidate['source']['path']==source.Path and candidate['all_valid']:
        matching=candidate; break
if matching is None: raise ValueError('Run a successful current-model dry run before the real-copy integration test')
copy_path=os.path.join(out,'live-model-test-copy.3dm')
wo=Rhino.FileIO.FileWriteOptions(); wo.SuppressAllInput=True; wo.UpdateDocumentPath=False
assert source.Write3dmFile(copy_path,wo)
copy_doc=Rhino.RhinoDoc.OpenHeadless(copy_path)
try:
    copy_before=model_geometry.snapshot(copy_doc)
    assert [s['id'] for s in copy_before['studies']]==[s['id'] for s in matching['source']['studies']]
    for actual,expected in zip(copy_before['studies'],matching['source']['studies']):
        assert json.dumps(actual['units'],sort_keys=True)==json.dumps(expected['units'],sort_keys=True)
        assert json.dumps(actual['boundary'])==json.dumps(expected['boundary'])
    applied=model_geometry.apply(copy_doc,copy_before,matching['results'],out,allow_headless=True)
    assert all(c['passed'] for c in applied['checks'])
    passed.append('Real 144-building proposal applies and verifies on a headless copy of the live document')
finally: copy_doc.Dispose()
assert model_geometry.fingerprint(source)==source_hash
report=dict(passed=passed,count=len(passed),live_source=source.Path,unchanged=True)
with open(os.path.join(out,'tests.json'),'w',encoding='utf-8') as f: json.dump(report,f,indent=2)
print(json.dumps(report))
