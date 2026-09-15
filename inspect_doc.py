import json
doc = __rhino_doc__
info = {
  "name": doc.Name,
  "path": doc.Path,
  "units": str(doc.ModelUnitSystem),
  "tolerance": doc.ModelAbsoluteTolerance,
  "angle_tolerance": doc.ModelAngleToleranceRadians,
  "object_count": doc.Objects.Count,
  "layer_count": doc.Layers.Count,
  "views": [v.ActiveViewport.Name for v in doc.Views],
  "groups": [i for i in range(doc.Groups.Count)],
  "instance_defs": [{"index": d.Index, "name": d.Name} for d in doc.InstanceDefinitions],
}
print(json.dumps(info, ensure_ascii=False))
def g(o, names, default=None):
    for n in names:
        if hasattr(o, n):
            return getattr(o, n)
    return default
layers = []
for i in range(doc.Layers.Count):
    L = doc.Layers[i]
    layers.append({"index": i, "name": L.FullPath,
                   "visible": g(L, ["IsVisible", "Visible"], None),
                   "locked": g(L, ["IsLocked", "Locked"], None),
                   "color": str(L.Color),
                   "obj_count": sum(1 for o in doc.Objects if o.Attributes.LayerIndex == i)})
print(json.dumps(layers, ensure_ascii=False))
