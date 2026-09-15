import System, os, json
D=__rhino_doc__

def _resort_project_root():
    override = globals().get('RT_PROJECT_ROOT')
    if override:
        return os.path.abspath(override)
    folder = os.path.dirname(__rhino_doc__.Path)
    while folder:
        candidate = os.path.join(folder, 'rhino-plugin', 'ResortTerrain')
        if os.path.isdir(os.path.join(candidate, 'src')):
            return candidate
        parent = os.path.dirname(folder)
        if parent == folder:
            break
        folder = parent
    raise RuntimeError('Set RT_PROJECT_ROOT to the ResortTerrain plugin folder.')
root = _resort_project_root()
asm=System.Reflection.Assembly.Load(System.IO.File.ReadAllBytes(os.path.join(root,'dist','Field.ResortTerrain.rhp')))
test=asm.GetType('Field.ResortTerrain.SelfTests').GetMethod('Run')
folder=os.path.join(System.IO.Path.GetTempPath(),'FieldResortTerrainTests',System.DateTime.Now.ToString('yyyyMMdd-HHmmss'))
try:
 result=test.Invoke(None,System.Array[System.Object]([folder]))
 open(os.path.join(root,'test-results.json'),'w').write(str(result));print(result)
except System.Exception as ex:
 error=str(ex)
 while ex.InnerException is not None:
  ex=ex.InnerException;error+='\n'+str(ex)
 print(error)
