import System, Rhino, os, json
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
package=os.path.join(System.Environment.GetFolderPath(System.Environment.SpecialFolder.ApplicationData),'McNeel','Rhinoceros','packages','8.0','field-resort-terrain','1.0.0')
System.IO.Directory.CreateDirectory(package)
for name in ['Field.ResortTerrain.rhp','README.md','manifest.yml']:
 System.IO.File.Copy(os.path.join(root,'dist',name),os.path.join(package,name),True)
result=Rhino.PlugIns.PlugIn.LoadPlugIn(os.path.join(package,'Field.ResortTerrain.rhp'))
print(str(result))
print(json.dumps(dict(installed_path=package)))
