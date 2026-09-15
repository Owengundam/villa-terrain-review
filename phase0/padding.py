"""Feasible-only automatic pads: preserve cleared relationships, never return a failed graph."""
import math
from core import heights,g
from sight import spans,coverage,HALF,ALLOWED

LIMIT=1.5

def fit(units,terrain,seed=None):
    ref=[terrain.sample(g.center(u['points'])) for u in units]
    z=[max(r-LIMIT,min(r+LIMIT,x)) for r,x in zip(ref,seed or ref)]
    rows=spans(units);edges=[];edge_set=set()
    def preserve():
        for i,row in enumerate(rows):
            for j,a,b in row:
                if z[i]-z[j]>=5.25-1e-6 and (i,j) not in edge_set:
                    edge_set.add((i,j));edges.append(dict(rear=i,front=j))
    def rank(values):
        covered=coverage(rows,values)
        return (sum(c>ALLOWED+1e-9 for c in covered),sum(max(0,c-ALLOWED) for c in covered),sum(covered),sum(b-a for i,row in enumerate(rows) for j,a,b in row if values[i]-values[j]<5.25-1e-6),sum((a-b)**2 for a,b in zip(values,ref)))
    for _ in range(len(units)+1):
        covered=coverage(rows,z)
        if max(covered,default=0)<=ALLOWED+1e-9:break
        preserve();best=None
        for i,row in enumerate(rows):
            if covered[i]<=ALLOWED+1e-9:continue
            for j,a,b in row:
                if (i,j) in edge_set:continue
                proposal=edges+[dict(rear=i,front=j)]
                # Exact bound propagation rejects impossible edges before projection.
                lo=[r-LIMIT for r in ref];possible=True
                for k in range(len(ref)+1):
                    changed=False
                    for e in proposal:
                        a,b=e['rear'],e['front']
                        if lo[a]<lo[b]+5.251-1e-8:
                            lo[a]=lo[b]+5.251;changed=True
                            if lo[a]>ref[a]+LIMIT+1e-7:possible=False;break
                    if not possible or not changed:break
                if not possible or changed:continue
                h=heights(ref,proposal,LIMIT,5.251)
                if not h['feasible']:continue
                key=rank(h['z'])
                if key<rank(z) and (best is None or key<best[0]):best=(key,h['z'],i,j)
        if best is None:break
        _,z,i,j=best;edges.append(dict(rear=i,front=j));edge_set.add((i,j))
    covered=coverage(rows,z)
    return dict(moves=[[0,0] for u in units],polys=[u['points'] for u in units],links=edges,reference=ref,z=z,feasible=max(covered,default=0)<=ALLOWED+1e-9,shortfalls=[],loss=sum(max(0,c-ALLOWED)**2 for c in covered),blocked_degrees=[math.degrees(c) for c in covered],clear_fraction=[1-c/(2*HALF) for c in covered])
