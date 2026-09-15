"""Independent final verification; never imports the optimizer."""
import math
import geometry as g

def check(study, moves, clearance=3., margin=.05, max_move=6., tolerance=.001):
    issues=[]; units=study['units']; polygons=[]; side_checks=[]
    for u in units:
        d=moves.get(u['id'],[0.,0.])
        if len(d)!=2 or not all(math.isfinite(v) for v in d): raise ValueError('Movements must be finite XY vectors')
        polygons.append(g.shifted(u['points'],d))
        if g.length(d)>max_move+tolerance: issues.append(dict(kind='movement_limit',building=u['id']))
        if u.get('fixed') and g.length(d)>tolerance: issues.append(dict(kind='fixed_building',building=u['id']))
        if not g.contains(study['boundary'],polygons[-1]): issues.append(dict(kind='outside_boundary',building=u['id']))
    for i,u in enumerate(units):
        for j in range(i+1,len(units)):
            if g.intersection_area(polygons[i],polygons[j])>1e-8:
                issues.append(dict(kind='overlap',a=u['id'],b=units[j]['id']))
            for a,b in ((i,j),(j,i)):
                forward=units[a]['view']; side=(forward[1],-forward[0])
                da,db=g.project(polygons[a],forward),g.project(polygons[b],forward)
                # Alongside means positive overlap in depth, evaluated in BOTH local frames.
                if min(da[1],db[1])-max(da[0],db[0])>1e-8:
                    sa,sb=g.project(polygons[a],side),g.project(polygons[b],side)
                    distance=max(sb[0]-sa[1],sa[0]-sb[1])
                    side_checks.append(distance)
                    if distance<=clearance or distance<clearance+margin-tolerance:
                        issues.append(dict(kind='side_clearance',a=units[a]['id'],b=units[b]['id'],gap=distance,required=clearance+margin))
    return dict(passed=not issues,issues=issues,minimum_directional_gap=min(side_checks) if side_checks else None,buildings=len(units))
