"""Dependency-free XY geometry for convex building footprints and simple site polygons."""
import math

EPS = 1e-8

def add(a, b): return (a[0]+b[0], a[1]+b[1])
def sub(a, b): return (a[0]-b[0], a[1]-b[1])
def mul(a, k): return (a[0]*k, a[1]*k)
def dot(a, b): return a[0]*b[0]+a[1]*b[1]
def cross(a, b): return a[0]*b[1]-a[1]*b[0]
def length(a): return math.hypot(*a)
def unit(a):
    n=length(a)
    if n < EPS: raise ValueError('Zero length direction')
    return mul(a, 1/n)
def edges(p): return list(zip(p, p[1:]+p[:1]))
def center(p): return (sum(v[0] for v in p)/len(p), sum(v[1] for v in p)/len(p))
def signed_area(p):
    origin=p[0]
    return sum(cross(sub(a,origin),sub(b,origin)) for a,b in edges(p))/2
def project(p, axis):
    values=[dot(v,axis) for v in p]
    return min(values),max(values)
def gap(a,b): return max(b[0]-a[1], a[0]-b[1])
def shifted(p,d): return [add(v,d) for v in p]
def axes(p): return [unit((-b[1]+a[1],b[0]-a[0])) for a,b in edges(p)]
def closest(p,a,b):
    v=sub(b,a); den=dot(v,v)
    return add(a,mul(v,max(0,min(1,dot(sub(p,a),v)/den)))) if den else a
def segment_parameters(a,b,c,d):
    r,s=sub(b,a),sub(d,c); den=cross(r,s)
    if abs(den)>EPS:
        t,u=cross(sub(c,a),s)/den,cross(sub(c,a),r)/den
        return [max(0,min(1,t))] if -EPS<=t<=1+EPS and -EPS<=u<=1+EPS else []
    if abs(cross(sub(c,a),r))>EPS: return []
    den=dot(r,r)
    return [max(0,min(1,dot(sub(p,a),r)/den)) for p in (c,d)] if den else []
def inside(p,poly):
    odd=False
    for a,b in edges(poly):
        if length(sub(p,closest(p,a,b)))<EPS: return True
        if (a[1]>p[1]) != (b[1]>p[1]):
            x=a[0]+(p[1]-a[1])*(b[0]-a[0])/(b[1]-a[1])
            if p[0]<x: odd=not odd
    return odd
def contains(site,poly):
    # Check every edge interval split at site intersections, including concave notches.
    if not all(inside(p,site) for p in poly): return False
    for a,b in edges(poly):
        ts=sorted(set([0.,1.]+[t for c,d in edges(site) for t in segment_parameters(a,b,c,d)]))
        if any(not inside(add(a,mul(sub(b,a),(x+y)/2)),site) for x,y in zip(ts,ts[1:]) if y-x>EPS): return False
    return True
def intersection_area(a,b):
    # Convex clipping is deliberately separate from the solver's SAT separation test.
    out=list(a); sign=1 if signed_area(b)>0 else -1
    for c,d in edges(b):
        old,out=out,[]
        if not old: break
        for x,y in edges(old):
            fx=sign*cross(sub(d,c),sub(x,c)); fy=sign*cross(sub(d,c),sub(y,c))
            if (fx>=0)!=(fy>=0): out.append(add(x,mul(sub(y,x),fx/(fx-fy))))
            if fy>=0: out.append(y)
    return abs(signed_area(out)) if len(out)>=3 else 0.
def validate_polygon(p,convex=False):
    if len(p)<3 or not all(math.isfinite(x) for v in p for x in v) or abs(signed_area(p))<EPS: raise ValueError('Invalid polygon')
    es=edges(p)
    for i,(a,b) in enumerate(es):
        if length(sub(b,a))<EPS: raise ValueError('Repeated boundary vertex')
        for j,(c,d) in enumerate(es):
            if j>i+1 and not(i==0 and j==len(es)-1) and segment_parameters(a,b,c,d): raise ValueError('Self-intersecting polygon')
    if convex:
        turns=[cross(sub(p[(i+1)%len(p)],p[i]),sub(p[(i+2)%len(p)],p[(i+1)%len(p)])) for i in range(len(p))]
        if min(turns)<-EPS and max(turns)>EPS: raise ValueError('Footprint must be convex')
