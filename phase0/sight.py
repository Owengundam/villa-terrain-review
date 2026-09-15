"""Central-view angular coverage: 70% clear within +/-15 degrees."""
import math
from core import g,clip,heights
HALF=math.radians(15); ALLOWED=math.radians(9)

def spans(units):
    result=[]
    for i,u in enumerate(units):
        c=g.center(u['points']);v=u['view'];s=(v[1],-v[0]);front=max(g.dot(g.sub(p,c),v) for p in u['points']);o=g.add(c,g.mul(v,front));row=[]
        for j,other in enumerate(units):
            if i==j:continue
            p=[(g.dot(g.sub(q,o),s),g.dot(g.sub(q,o),v)) for q in other['points']]
            p=clip(p,0,1,1e-8)
            if len(p)<3:continue
            angles=[math.atan2(x,y) for x,y in p];lo=max(-HALF,min(angles));hi=min(HALF,max(angles))
            if hi>lo+1e-10:row.append((j,lo,hi))
        result.append(row)
    return result

def union(intervals):
    end=-math.inf;total=0.
    for lo,hi in sorted(intervals):
        total+=max(0,hi-max(lo,end));end=max(end,hi)
    return total

def coverage(rows,z):
    return [union([(a,b) for j,a,b in row if z[i]-z[j]<5.25-1e-6]) for i,row in enumerate(rows)]

def fit(units,terrain):
    ref=[terrain.sample(g.center(u['points'])) for u in units];rows=spans(units);edges=[];z=ref[:];h=dict(z=z,feasible=True,shortfalls=[],loss=0.)
    for _ in range(sum(map(len,rows))+1):
        covered=coverage(rows,z)
        if max(covered,default=0)<=ALLOWED+1e-10:break
        i=max(range(len(units)),key=lambda k:covered[k])
        choices=[(b-a,j) for j,a,b in rows[i] if z[i]-z[j]<5.25-1e-6 and not any(e['rear']==i and e['front']==j for e in edges)]
        if not choices:break
        _,j=max(choices);edges.append(dict(rear=i,front=j));h=heights(ref,edges,3.,5.251);z=h['z']
        if not h['feasible']:break
    covered=coverage(rows,z);valid=max(covered,default=0)<=ALLOWED+1e-10 and h['feasible']
    return dict(moves=[[0,0] for u in units],polys=[u['points'] for u in units],links=edges,reference=ref,z=z,feasible=valid,shortfalls=h['shortfalls'],loss=h['loss'],blocked_degrees=[math.degrees(c) for c in covered],clear_fraction=[1-c/(2*HALF) for c in covered])

def verify_new(study,state,terrain,cfg):
    from checker import check
    units=study['units'];r=check(study,{})
    issues=list(r['issues'])
    for i,z in enumerate(state['z']):
        if not math.isfinite(z) or abs(z-terrain.sample(g.center(units[i]['points'])))>cfg.get('pad_limit',3)+1e-6:issues.append(dict(kind='pad_limit',building=i))
    covered=coverage(spans(units),state['z'])
    for i,c in enumerate(covered):
        if c>ALLOWED+1e-9:issues.append(dict(kind='angular_obstruction',building=i,degrees=math.degrees(c)))
    # Independent ray/polygon intersections cross-check the interval calculation.
    for i,u in enumerate(units):
        v=u['view'];s=(v[1],-v[0]);c=g.center(u['points']);o=g.add(c,g.mul(v,max(g.dot(g.sub(p,c),v) for p in u['points'])))
        blocked=0;n=600
        for k in range(n):
            angle=-HALF+(k+.5)*2*HALF/n;ray=g.add(g.mul(v,math.cos(angle)),g.mul(s,math.sin(angle)));hit=False
            for j,other in enumerate(units):
                if j==i or state['z'][i]-state['z'][j]>=5.25-1e-6:continue
                for a,b in g.edges(other['points']):
                    edge=g.sub(b,a);den=g.cross(ray,edge)
                    if abs(den)<1e-12:continue
                    delta=g.sub(a,o);t=g.cross(delta,edge)/den;q=g.cross(delta,ray)/den
                    if t>1e-8 and 0<=q<=1:hit=True;break
                if hit:break
            blocked+=hit
        if abs(blocked/n-covered[i]/(2*HALF))>max(.005,len(units)/n):issues.append(dict(kind='ray_coverage_disagreement',building=i))
    return dict(passed=not issues,issues=issues,clearance_cleanup_issues=r['issues'],minimum_clear_fraction=1-max(covered,default=0)/(2*HALF),view_rule='central +/-15 degrees; union obstruction <=30%',relationships=len(state['links']))
