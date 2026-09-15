"""Rhino adapter: validated footprints, spatial copy matching, guarded XY application."""
import hashlib, json, math, os
import geometry as g

def object_state(value):
    import Rhino
    return value.ToJSON(Rhino.FileIO.SerializationOptions())

def attribute_signature(a):
    # Serialized archives can change encoding on Replace/ModifyAttributes. Compare
    # the document-facing values rather than the binary archive representation.
    names=('ObjectId','Name','LayerIndex','Mode','Visible','MaterialIndex','MaterialSource','ObjectColor','ColorSource','PlotColor','PlotColorSource','PlotWeight','PlotWeightSource','LinetypeIndex','LinetypeSource','WireDensity','DisplayOrder','Space','ViewportId','Url')
    values={name:str(getattr(a,name)) for name in names if hasattr(a,name)}
    strings=a.GetUserStrings()
    values['user_strings']={key:strings[key] for key in strings.AllKeys}
    values['groups']=list(a.GetGroupList() or [])
    return values

def fingerprint(doc):
    rows=[(str(o.Id),str(o.Geometry.DataCRC(0)),attribute_signature(o.Attributes)) for o in doc.Objects]
    layers=[(str(l.Id),object_state(l)) for l in doc.Layers if not l.IsDeleted]
    definitions=[(str(d.Id),[(str(o.Id),o.Geometry.DataCRC(0)) for o in d.GetObjects()]) for d in doc.InstanceDefinitions if not d.IsDeleted]
    return hashlib.sha256(json.dumps([str(doc.ModelUnitSystem),doc.ModelAbsoluteTolerance,sorted(rows),layers,definitions],sort_keys=True).encode()).hexdigest()

def _center(o):
    p=o.Geometry.GetBoundingBox(True).Center
    return (p.X,p.Y)

def _building_center(module):
    # Annotation extents can protrude beyond the building (the banquet label does).
    import Rhino
    boxes=[]
    def visit(definition,xf,depth=0):
        if depth>16: raise ValueError('Excessively nested block')
        for obj in definition.GetObjects():
            if isinstance(obj,Rhino.DocObjects.InstanceObject): visit(obj.InstanceDefinition,xf*obj.InstanceXform,depth+1)
            elif not isinstance(obj.Geometry,(Rhino.Geometry.AnnotationBase,Rhino.Geometry.TextDot)):
                geom=obj.Geometry.Duplicate(); geom.Transform(xf); boxes.append(geom.GetBoundingBox(True))
    visit(module.InstanceDefinition,module.InstanceXform)
    if not boxes: raise ValueError('Block contains no physical geometry')
    return ((min(b.Min.X for b in boxes)+max(b.Max.X for b in boxes))/2,(min(b.Min.Y for b in boxes)+max(b.Max.Y for b in boxes))/2)

def _source_envelope_center(module):
    import Rhino
    boxes=[o.Geometry.GetBoundingBox(True) for o in module.InstanceDefinition.GetObjects()]
    point=Rhino.Geometry.Point3d((min(b.Min.X for b in boxes)+max(b.Max.X for b in boxes))/2,(min(b.Min.Y for b in boxes)+max(b.Max.Y for b in boxes))/2,0)
    point.Transform(module.InstanceXform)
    return (point.X,point.Y)

def snapshot(doc):
    import Rhino
    if doc.ModelUnitSystem != Rhino.UnitSystem.Meters: raise ValueError('Phase 2 requires metre model units')
    tolerance=float(doc.ModelAbsoluteTolerance)
    if tolerance>.01: raise ValueError('Model tolerance above 1 cm; review units and tolerance first')
    objects=list(doc.Objects); studies=[]; by_prefix={}
    for o in objects:
        if isinstance(o,Rhino.DocObjects.InstanceObject) and o.Attributes.GetUserString('Function'):
            prefix=doc.Layers[o.Attributes.LayerIndex].FullPath.rsplit('::',1)[0]+'::'
            by_prefix.setdefault(prefix,[]).append(o)
    if not by_prefix: raise ValueError('No tagged building instances found')
    for prefix,modules in sorted(by_prefix.items()):
        option=prefix.strip(':').split('::')[-1]
        related=[o for o in objects if doc.Layers[o.Attributes.LayerIndex].FullPath.startswith(prefix)]
        boundaries=[o for o in related if doc.Layers[o.Attributes.LayerIndex].FullPath==prefix+'01_BOUNDARY' and o.Name in ('Original TRACE_01_REDLINE','RT_BOUNDARY')]
        if not boundaries: raise ValueError(option+': missing named site boundary')
        copies=[]
        for boundary in boundaries:
            if not isinstance(boundary.Geometry,Rhino.Geometry.Curve) or not boundary.Geometry.IsClosed: raise ValueError('Boundary must be a closed curve')
            ok,line=boundary.Geometry.TryGetPolyline()
            if not ok: raise ValueError('Boundary must be a polyline; approximate curved boundaries explicitly before using this version')
            points=[(p.X,p.Y) for p in list(line)[:-1]]; g.validate_polygon(points)
            copies.append(dict(id=str(boundary.Id),name=option+' / '+str(boundary.Id)[:8],boundary=points,units=[]))
        for module in modules:
            c=_building_center(module); owners=[s for s in copies if g.inside(c,s['boundary'])]
            if len(owners)!=1: raise ValueError(module.Name+': centre must identify exactly one site copy; select/repair ambiguous boundary geometry')
            owner=owners[0]
            peers=[m for m in modules if m.Name==module.Name]
            linked=[]
            for q in related:
                if q.Id==module.Id: linked.append(q); continue
                if isinstance(q,Rhino.DocObjects.InstanceObject): continue
                if q.Name!=module.Name and not (q.Name or '').startswith(module.Name+' '): continue
                ranked=sorted((g.length(g.sub(_center(q),_center(m))),str(m.Id)) for m in peers)
                if len(ranked)>1 and abs(ranked[0][0]-ranked[1][0])<.05: raise ValueError(module.Name+': ambiguous linked object')
                if ranked[0][1]==str(module.Id): linked.append(q)
            fills=[q for q in linked if q.Name==module.Name+' footprint fill']
            if len(fills)!=1 or not isinstance(fills[0].Geometry,Rhino.Geometry.Mesh): raise ValueError(module.Name+': expected one footprint mesh')
            fill=fills[0]; mesh=fill.Geometry
            if not mesh.IsValid: raise ValueError(module.Name+': invalid footprint mesh')
            loops=mesh.GetNakedEdges()
            if loops is None or len(loops)!=1 or not loops[0].IsClosed: raise ValueError(module.Name+': footprint needs a single boundary without holes')
            pts=list(loops[0])[:-1]
            if len(pts)!=4 or max(p.Z for p in pts)-min(p.Z for p in pts)>.01: raise ValueError(module.Name+': expected level four-corner footprint')
            poly=[(p.X,p.Y) for p in pts]; g.validate_polygon(poly,convex=True)
            centres=[c,_source_envelope_center(module)]
            if min(g.length(g.sub(g.center(poly),p)) for p in centres)>.05: raise ValueError(module.Name+': block and footprint are misaligned; repair before Phase 2')
            xf=module.InstanceXform
            basis=[(xf.M00,xf.M10,xf.M20),(xf.M01,xf.M11,xf.M21),(xf.M02,xf.M12,xf.M22)]
            if any(abs(math.sqrt(sum(v*v for v in b))-1)>.001 for b in basis) or abs(xf.M20)+abs(xf.M21)>1e-6 or abs(xf.M22-1)>.001:
                raise ValueError(module.Name+': scaled or tilted blocks are unsupported')
            arrows=[q for q in linked if q.Name==module.Name+' main view' and isinstance(q.Geometry,Rhino.Geometry.Curve)]
            if not arrows: raise ValueError(module.Name+': missing main view arrow')
            arrow=max(arrows,key=lambda q:q.Geometry.GetLength()).Geometry
            view=g.unit((arrow.PointAtEnd.X-arrow.PointAtStart.X,arrow.PointAtEnd.Y-arrow.PointAtStart.Y))
            # The fixed view direction must align with a footprint axis for directional side checking.
            if max(abs(g.dot(a,view)) for a in g.axes(poly))<.999: raise ValueError(module.Name+': main view does not align with footprint; review orientation')
            fixed=any(q.IsLocked for q in linked) or (module.Attributes.GetUserString('Phase2Fixed') or '').lower()=='true'
            owner['units'].append(dict(id=str(module.Id),name=module.Name,points=poly,view=view,fixed=fixed,alignment_basis='physical geometry' if g.length(g.sub(g.center(poly),c))<=.05 else 'source definition envelope including annotation extents',linked_ids=[str(q.Id) for q in linked],fill_id=str(fill.Id),transform=[[xf[i,j] for j in range(4)] for i in range(4)],z=[p.Z for p in pts]))
        for s in copies:
            if not s['units']: raise ValueError(s['name']+': boundary contains no buildings')
            s['units'].sort(key=lambda u:u['id']); studies.append(s)
    return dict(schema=1,path=doc.Path,tolerance=tolerance,fingerprint=fingerprint(doc),studies=sorted(studies,key=lambda s:s['id']))

def verify_rhino(doc, before, results):
    """Re-extract actual geometry, verify constraints and all non-XY invariants."""
    from checker import check
    after=snapshot(doc); maps={s['id']:s for s in after['studies']}; checks=[]
    for s,r in zip(before['studies'],results):
        actual=maps[s['id']]; amap={u['id']:u for u in actual['units']}
        if set(amap)!={u['id'] for u in s['units']}: raise ValueError('Building IDs/count changed')
        cfg=r['settings']; checked=check(actual,{},**{k:cfg[k] for k in ('clearance','margin','max_move','tolerance')})
        if not checked['passed']: raise ValueError('Read-back layout failed clearance/boundary verification')
        tol=max(.002,before['tolerance']*2)
        for u in s['units']:
            v=amap[u['id']]; dx,dy=r['moves'][u['id']]
            for i in range(4):
                for j in range(4):
                    expected=u['transform'][i][j]+(dx if (i,j)==(0,3) else dy if (i,j)==(1,3) else 0)
                    if abs(v['transform'][i][j]-expected)>1e-7: raise ValueError('Block transform changed beyond XY translation')
            expected=g.shifted(u['points'],(dx,dy))
            if max(min(g.length(g.sub(p,q)) for q in v['points']) for p in expected)>tol: raise ValueError('Footprint shape or location mismatch')
            if max(abs(a-b) for a,b in zip(sorted(u['z']),sorted(v['z'])))>1e-6: raise ValueError('Footprint height changed')
            if g.length(g.sub(u['view'],v['view']))>1e-6: raise ValueError('Orientation changed')
        checks.append(checked)
    return checks

def apply(doc, before, results, backup_dir, allow_headless=False):
    """Apply only a fresh, completely verified proposal. Backup and rollback on failure."""
    import Rhino, System
    from checker import check
    if fingerprint(doc)!=before['fingerprint']: raise ValueError('Model changed since dry run; rerun Phase 2')
    if len(results)!=len(before['studies']): raise ValueError('Study result count mismatch')
    for s,r in zip(before['studies'],results):
        if r['status']!='valid': raise ValueError('Unresolved proposal cannot be applied')
        cfg=r['settings']
        if not check(s,r['moves'],**{k:cfg[k] for k in ('clearance','margin','max_move','tolerance')})['passed']: raise ValueError('Proposal failed independent verification')
    changes={}
    for s,r in zip(before['studies'],results):
        for u in s['units']:
            d=r['moves'][u['id']]
            if g.length(d)<1e-9: continue
            for oid in u['linked_ids']:
                if oid in changes: raise ValueError('Linked object assigned to multiple buildings')
                changes[oid]=d
    if not changes: return dict(applied=False,reason='Already clear; no movements needed',checks=verify_rhino(doc,before,results))
    os.makedirs(backup_dir,exist_ok=True)
    path=os.path.join(backup_dir,'before-phase2-'+str(System.Guid.NewGuid())+'.3dm')
    options=Rhino.FileIO.FileWriteOptions(); options.SuppressAllInput=True; options.UpdateDocumentPath=False
    if not doc.Write3dmFile(path,options): raise RuntimeError('Backup failed')
    originals={}; expected={}
    for oid,d in changes.items():
        obj=doc.Objects.FindId(System.Guid(oid)); original=obj.Geometry.Duplicate(); changed=original.Duplicate()
        if not changed.Transform(Rhino.Geometry.Transform.Translation(d[0],d[1],0)): raise RuntimeError('Geometry translation failed')
        originals[oid]=original; expected[oid]=changed
    untouched={str(o.Id):(o.Geometry.DataCRC(0),object_state(o.Attributes)) for o in doc.Objects if str(o.Id) not in changes}
    attrs={oid:object_state(doc.Objects.FindId(System.Guid(oid)).Attributes) for oid in changes}
    attr_values={oid:attribute_signature(doc.Objects.FindId(System.Guid(oid)).Attributes) for oid in changes}
    def restore_attributes(oid):
        a=Rhino.Runtime.CommonObject.FromJSON(attrs[oid])
        a.RemoveFromAllGroups()
        for group in attr_values[oid]['groups']: a.AddToGroup(group)
        return doc.Objects.ModifyAttributes(System.Guid(oid),a,True)
    token=doc.BeginUndoRecord('Phase 2 planar clearance'); done=[]
    try:
        for oid,geom in expected.items():
            if not doc.Objects.Replace(System.Guid(oid),geom,False): raise RuntimeError('Could not replace translated object '+oid)
            done.append(oid)
            if not restore_attributes(oid): raise RuntimeError('Could not preserve attributes')
        checks=verify_rhino(doc,before,results)
        for o in doc.Objects:
            oid=str(o.Id)
            if oid in untouched and (o.Geometry.DataCRC(0),object_state(o.Attributes))!=untouched[oid]: raise RuntimeError('Unrelated geometry changed')
            if oid in attr_values and attribute_signature(o.Attributes)!=attr_values[oid]:
                now=attribute_signature(o.Attributes)
                raise RuntimeError('Attributes changed '+oid+': '+str({k:(v,now.get(k)) for k,v in attr_values[oid].items() if now.get(k)!=v}))
        for oid,geom in expected.items():
            if not Rhino.Geometry.GeometryBase.GeometryEquals(doc.Objects.FindId(System.Guid(oid)).Geometry,geom): raise RuntimeError('Linked geometry read-back mismatch '+oid+' '+str(geom.GetType()))
        return dict(applied=True,backup=path,moved_objects=len(changes),checks=checks,saved=False)
    except Exception:
        failures=[oid for oid in reversed(done) if not doc.Objects.Replace(System.Guid(oid),originals[oid],True)]
        failures.extend(oid for oid in done if not restore_attributes(oid))
        if failures: raise RuntimeError('Rollback incomplete; recover pre-apply backup '+path)
        raise
    finally:
        doc.EndUndoRecord(token)
        if not allow_headless: doc.Views.Redraw()
