"""Read-only contour and elevation annotation inspection."""
import json
doc=__rhino_doc__
result=[]
for obj in doc.Objects:
    layer=doc.Layers[obj.Attributes.LayerIndex].FullPath
    if not any(s in layer for s in ['Smooth contours','Spot elevations','Contour labels']):continue
    geo=obj.Geometry;box=geo.GetBoundingBox(True)
    item=dict(id=str(obj.Id),layer=layer,type=geo.GetType().Name,name=obj.Attributes.Name,bounds=[[box.Min.X,box.Min.Y,box.Min.Z],[box.Max.X,box.Max.Y,box.Max.Z]])
    for attr in ['PlainText','Text','TextHeight']:
        try:item[attr]=str(getattr(geo,attr))
        except:pass
    strings=obj.Attributes.GetUserStrings()
    if strings:item['user_strings']={str(k):strings[k] for k in strings.AllKeys}
    result.append(item)
print(json.dumps(result,ensure_ascii=False))
