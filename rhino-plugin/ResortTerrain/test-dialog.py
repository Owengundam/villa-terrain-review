import System, os, json
D=__rhino_doc__;
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
try:
 dialog=asm.GetType('Field.ResortTerrain.Interface').GetMethod('BuildDialog').Invoke(None,System.Array[System.Object]([D]))
 print(json.dumps(dict(dialog=dialog.Title,content=dialog.Content.GetType().FullName,buttons=[dialog.DefaultButton.Text,dialog.AbortButton.Text])))
 dialog.Dispose()
except System.Exception as ex:
 while ex.InnerException is not None:ex=ex.InnerException
 print(str(ex))
