"""Fixed-centre image reconstruction, bounded rotation, then verified reduction."""
import json, math, copy
from pathlib import Path
from run import ROOT, Terrain, g, rectangle, contour_view
from sight import spans, verify_new
from padding import fit
from audit_reduction import facade_levels
from checker import check

OUT=ROOT/'output/checks/image-reduction-20260915'

def pair(a,b):
    # Identical directional side-clearance semantics to the independent checker.
    if g.intersection_area(a['points'],b['points'])>1e-8:return True
    for u in (a,b):
        v=u['view'];s=(v[1],-v[0]);p,q=g.project(a['points'],v),g.project(b['points'],v)
        if min(p[1],q[1])-max(p[0],q[0])>1e-8:
            p,q=g.project(a['points'],s),g.project(b['points'],s)
            if max(q[0]-p[1],p[0]-q[1])<3.05:return True
    return False

def main():
    ref=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335-reference.json').read_text(encoding='utf8'))
    source=ref['studies'][0];boundary=source['source']['boundary'];contours=source['source']['contours']
    t=Terrain.__new__(Terrain)
    for k,v in source['terrain'].items():setattr(t,k,v)
    t.ny=len(t.grid);t.nx=len(t.grid[0])
    extracted=json.loads((OUT/'extracted.json').read_text(encoding='utf8'))
    report=dict(reference=ref['reference'],boundary=boundary,contours=contours,site_area=abs(g.signed_area(boundary)),rules=dict(width=11,depth=23,rotation=15,side_gap=3,construction_buffer=.05,pad_limit=1.5,drop=5.25,cone_half=15,minimum_clear=.7),layouts=[])
    for layout in extracted['layouts']:
        units=[];candidates=[]
        for raw in layout['units']:
            c=raw['center'];normal=contour_view(c,contours,t);axis=raw['image_axis']
            # Determine downhill over the actual 23 m footprint, not a noisy 1 m derivative.
            rear,front=facade_levels(c,normal,t)
            if front>rear:normal=g.mul(normal,-1)
            if g.dot(axis,normal)<0:axis=g.mul(axis,-1)
            angle=math.degrees(math.atan2(g.cross(normal,axis),g.dot(normal,axis)))
            preferred=max(-15,min(15,angle));choices=[]
            for turn in sorted(set([preferred,-15,-7.5,0,7.5,15]),key=lambda a:abs(a-preferred)):
                a=math.radians(turn);v=[normal[0]*math.cos(a)-normal[1]*math.sin(a),normal[0]*math.sin(a)+normal[1]*math.cos(a)]
                rear,front=facade_levels(c,v,t)
                if front>=rear-1e-8:continue
                choices.append(dict(id=raw['id'],name=raw['id'],center=c,points=rectangle(c,v,11,23),view=v,normal=normal,rotation=turn,reference=t.sample(c),image_angle=angle,rear_terrain=rear,front_terrain=front,downhill_drop=rear-front))
            assert choices,raw['id']+' has no downhill orientation'
            units.append(choices[0]);candidates.append(choices)
        # Coordinate descent reduces clearance conflicts before deleting anything.
        for _ in range(4):
            changed=False
            for i,options in enumerate(candidates):
                def rank(u):return (1000*(not g.contains(boundary,u['points']))+sum(pair(u,b) for j,b in enumerate(units) if j!=i),abs(u['rotation']-max(-15,min(15,u['image_angle']))))
                best=min(options,key=rank)
                if rank(best)<rank(units[i]):units[i]=best;changed=True
            if not changed:break
        outside=[i for i,u in enumerate(units) if not g.contains(boundary,u['points'])]
        conflicts=[[i,j] for i,a in enumerate(units) for j,b in enumerate(units) if i<j and pair(a,b)]
        active=set(range(len(units)));history=[];reasons={}
        def remove(i,reason):active.remove(i);reasons[i]=reason;history.append(dict(id=units[i]['id'],reason=reason))
        for i in outside:remove(i,'boundary')
        while True:
            edges=[(i,j) for i,j in conflicts if i in active and j in active]
            if not edges:break
            degree={i:sum(i in e for e in edges) for i in active}
            remove(max(active,key=lambda i:(degree[i],i)),'clearance')
        while active:
            ids=sorted(active);h=fit([units[i] for i in ids],t)
            if h['feasible']:break
            weights={i:0 for i in ids}
            for e,short in zip(h['links'],h['shortfalls']):
                for k in ('rear','front'):weights[ids[e[k]]]+=short
            if max(weights.values())<1e-8:
                for k,c in enumerate(h['clear_fraction']):weights[ids[k]]=max(0,.7-c)
            remove(max(ids,key=lambda i:(weights[i],i)),'view / elevation')
        # Reinsert wherever the final reduced neighbourhood now permits it.
        for i in sorted(set(range(len(units)))-active):
            if i in outside or any((i==a and b in active) or (i==b and a in active) for a,b in conflicts):continue
            ids=sorted(active|{i});test=fit([units[j] for j in ids],t)
            if test['feasible']:active.add(i);reasons.pop(i,None)
        ids=sorted(active);kept=[units[i] for i in ids];h=fit(kept,t)
        verification=verify_new(dict(boundary=boundary,units=kept),h,t,{'pad_limit':1.5})
        verification['downhill_passed']=all(facade_levels(u['center'],u['view'],t)[0]>facade_levels(u['center'],u['view'],t)[1]+1e-8 for u in units)
        verification['orientation_passed']=all(abs(u['rotation'])<=15+1e-8 and g.dot(u['view'],u['normal'])>=math.cos(math.radians(15))-1e-10 for u in units)
        verification['standard_geometry_passed']=all(abs(abs(g.signed_area(u['points']))-253)<1e-6 for u in units)
        assert verification['passed'] and verification['orientation_passed'] and verification['standard_geometry_passed'] and verification['downhill_passed'],verification
        for i,u in enumerate(units):
            u['active']=i in active;u['reason']=reasons.get(i,'retained');u['z']=h['z'][ids.index(i)] if i in active else u['reference']
        result=dict(name=layout['name'],registration=layout['registration'],source_image=layout['image'],units=units,spans=spans(units),conflicts=conflicts,outside=outside,history=history,verification=verification,initial_count=len(units),retained_count=len(active))
        report['layouts'].append(result)
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(layout['name'],len(units),'->',len(active),'PASS',flush=True)
    return report

if __name__=='__main__':main()
