"""Independent world-space view-geometry and final-constraint checker."""
import math
from core import g

def relationships(units,polys):
    found=[]
    for i,u in enumerate(units):
        c=g.center(polys[i]); v=u['view']; s=(v[1],-v[0]); forward=max(g.dot(g.sub(p,c),v) for p in polys[i]); origin=g.add(c,g.mul(v,forward))
        lo,hi=g.project([g.sub(p,c) for p in polys[i]],s)
        far=max(g.length(g.sub(p,origin)) for poly in polys for p in poly)*2+10
        apex=g.add(origin,g.mul(v,far))
        cone=[origin,g.add(apex,g.mul(s,far*math.sqrt(3))),g.sub(apex,g.mul(s,far*math.sqrt(3)))]
        corridor=[g.add(origin,g.mul(s,lo)),g.add(origin,g.mul(s,hi)),g.add(apex,g.mul(s,hi)),g.add(apex,g.mul(s,lo))]
        nearest=[]; axial=set()
        for j,poly in enumerate(polys):
            if i==j: continue
            if g.intersection_area(poly,cone)>1e-8:
                dist=0 if g.inside(origin,poly) else min(g.length(g.sub(origin,g.closest(origin,a,b))) for a,b in g.edges(poly))
                nearest.append((dist,units[j]['name'],j))
            if g.intersection_area(poly,corridor)>1e-8: axial.add(j)
        n=min(nearest)[2] if nearest else None
        found.extend((i,j) for j in sorted(axial|({n} if n is not None else set())))
    return found

def verify(study,state,terrain,cfg):
    if state is None: return dict(passed=False,issues=[dict(kind='invalid_input')])
    ps=[g.shifted(u['points'],d) for u,d in zip(study['units'],state['moves'])]; issues=[]
    if len(ps)!=len(study['units']) or len(state['z'])!=len(ps): return dict(passed=False,issues=[dict(kind='wrong_count')])
    for i,(u,p,d,z) in enumerate(zip(study['units'],ps,state['moves'],state['z'])):
        if not math.isfinite(z) or not all(math.isfinite(x) for x in d): issues.append(dict(kind='nonfinite',building=i)); continue
        if g.length(d)>cfg['max_move']+1e-6: issues.append(dict(kind='move_limit',building=i))
        if u.get('fixed') and g.length(d)>1e-8: issues.append(dict(kind='fixed_xy',building=i))
        if not g.contains(study['boundary'],p): issues.append(dict(kind='boundary',building=i))
        if abs(z-terrain.sample(g.center(p)))>cfg['pad_limit']+1e-6: issues.append(dict(kind='pad_limit',building=i))
        for j in range(i):
            if g.intersection_area(p,ps[j])>1e-7: issues.append(dict(kind='overlap',a=i,b=j))
    edges=relationships(study['units'],ps)
    solver_edges={(e['rear'],e['front']) for e in state['links']}
    if set(edges)!=solver_edges: issues.append(dict(kind='view_graph_disagreement'))
    for i,j in edges:
        drop=state['z'][i]-state['z'][j]
        if drop<cfg['drop']-1e-5: issues.append(dict(kind='view_drop',rear=i,front=j,drop=drop,shortfall=cfg['drop']-drop))
    from checker import check
    clearance=check(study,{u['id']:d for u,d in zip(study['units'],state['moves'])},max_move=cfg['max_move'])
    return dict(passed=not issues,issues=issues,relationships=len(edges),minimum_drop=min((state['z'][i]-state['z'][j] for i,j in edges),default=None),clearance_cleanup_issues=clearance['issues'])
