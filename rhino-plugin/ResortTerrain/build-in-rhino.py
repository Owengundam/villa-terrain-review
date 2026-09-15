"""Compile the native RHP using the Roslyn compiler bundled with Rhino 8. Run in Rhino Python 3."""
import clr, os, System, json
from System.Collections.Generic import List
clr.AddReference('Microsoft.CodeAnalysis')
clr.AddReference('Microsoft.CodeAnalysis.CSharp')
from Microsoft.CodeAnalysis import MetadataReference, SyntaxTree, OutputKind, OptimizationLevel
from Microsoft.CodeAnalysis.CSharp import CSharpCompilation,CSharpCompilationOptions,CSharpSyntaxTree,CSharpParseOptions,LanguageVersion
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
root=os.path.abspath(root)
source=os.path.join(root,'src');target=os.path.join(root,'dist','Field.ResortTerrain.rhp')
trees=List[SyntaxTree]()
for name in sorted(os.listdir(source)):
 if name.endswith('.cs'):
  path=os.path.join(source,name)
  trees.Add(CSharpSyntaxTree.ParseText(open(path,encoding='utf-8-sig').read(),CSharpParseOptions(LanguageVersion.Latest),path))
paths={}
for path in str(System.AppContext.GetData('TRUSTED_PLATFORM_ASSEMBLIES')).split(os.pathsep):
 if os.path.isfile(path):paths[os.path.basename(path).lower()]=path
for asm in System.AppDomain.CurrentDomain.GetAssemblies():
 try:
  path=asm.Location
  if path and os.path.isfile(path):paths.setdefault(os.path.basename(path).lower(),path)
 except:pass
refs=List[MetadataReference]()
for path in paths.values():
 try:refs.Add(MetadataReference.CreateFromFile(path))
 except:pass
options=CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary).WithOptimizationLevel(OptimizationLevel.Release)
comp=CSharpCompilation.Create('Field.ResortTerrain',trees,refs,options)
stream=System.IO.FileStream(target,System.IO.FileMode.Create)
try:result=comp.Emit(stream)
finally:stream.Dispose()
messages=[str(d) for d in result.Diagnostics if str(d.Severity) in ['Error','Warning']]
open(os.path.join(root,'build-log.json'),'w').write(json.dumps(dict(success=result.Success,messages=messages),indent=2))
print(json.dumps(dict(success=result.Success,target=target,messages=messages)))

