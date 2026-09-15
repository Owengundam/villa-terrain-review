"""Phase 2: local XY search with bounded elevations. Standard library only."""
import os,sys,math,time
sys.path.insert(0,os.path.join(os.path.dirname(os.path.dirname(__file__)),'phase2'))
import geometry as g

def clip(poly,a,b,k=0):
    result=[]
    for p,q in g.edges(poly):
        x=a*p[0]+b*p[1]-k; y=a*q[0]+b*q[1]-k
        if (x>=0)!=(y>=0): result.append(g.add(p,g.mul(g.sub(q,p),x/(x-y))))
        if y>=0: result.append(q)
    return result

def links(units,polys):
    result=[]; tan=math.sqrt(3)
    for i,u in enumerate(units):
        v=u['view']; side=(v[1],-v[0]); c=g.center(polys[i])
        front=max(g.dot(g.sub(p,c),v) for p in polys[i]); origin=g.add(c,g.mul(v,front))
        lo,hi=g.project([g.sub(p,c) for p in polys[i]],side)
        candidates=[]; axial=set()
        for j,poly in enumerate(polys):
            if i==j: continue
            local=[(g.dot(g.sub(p,origin),side),g.dot(g.sub(p,origin),v)) for p in poly]
            if max(p[1] for p in local)<=0: continue
            cone=clip(clip(clip(local,0,1),1,tan),-1,tan)
            if len(cone)>=3 and abs(g.signed_area(cone))>1e-8:
                distance=0 if g.inside((0,0),local) else min(g.length(g.closest((0,0),a,b)) for a,b in g.edges(local))
                candidates.append((distance,units[j]['name'],j))
            corridor=clip(clip(clip(local,0,1),1,0,lo),-1,0,-hi)
            if len(corridor)>=3 and abs(g.signed_area(corridor))>1e-8: axial.add(j)
        nearest=min(candidates)[2] if candidates else None
        for j in sorted(axial|({nearest} if nearest is not None else set())):
            result.append(dict(rear=i,front=j,cone=j==nearest,axial=j in axial))
    return result

class Terrain:
    """Piecewise bilinear reference, sampled from distances to actual contour lines."""
    def __init__(self,study,spacing=8.):
        self.spacing=spacing
        self.x0=min(p[0] for p in study['boundary']); self.y0=min(p[1] for p in study['boundary'])
        self.nx=math.ceil((max(p[0] for p in study['boundary'])-self.x0)/spacing)+1
        self.ny=math.ceil((max(p[1] for p in study['boundary'])-self.y0)/spacing)+1
        by_z={}
        for c in study['contours']:
            by_z.setdefault(round(c['z'],4),[]).extend(zip(c['points'],c['points'][1:]))
        if len(by_z)<3: raise ValueError('At least three contour levels required')
        segments=[]
        for z,es in by_z.items():
            segments.append((z,[(a[0],a[1],b[0]-a[0],b[1]-a[1],(b[0]-a[0])**2+(b[1]-a[1])**2) for a,b in es]))
        self.grid=[]
        for j in range(self.ny):
            row=[]; py=self.y0+j*spacing
            for i in range(self.nx):
                px=self.x0+i*spacing; distances=[]
                for z,es in segments:
                    best=math.inf
                    for x,y,dx,dy,den in es:
                        t=max(0.,min(1.,((px-x)*dx+(py-y)*dy)/den)) if den else 0.
                        d=(px-x-t*dx)**2+(py-y-t*dy)**2
                        if d<best: best=d
                    distances.append((math.sqrt(best),z))
                distances.sort(); (d1,z1),(d2,z2)=distances[:2]
                row.append((z1*d2+z2*d1)/(d1+d2) if d1+d2>1e-9 else z1)
            self.grid.append(row)
    def sample(self,p):
        fx=(p[0]-self.x0)/self.spacing; fy=(p[1]-self.y0)/self.spacing
        i=max(0,min(self.nx-2,int(fx))); j=max(0,min(self.ny-2,int(fy)))
        a=max(0,min(1,fx-i)); b=max(0,min(1,fy-j))
        return (1-b)*((1-a)*self.grid[j][i]+a*self.grid[j][i+1])+b*((1-a)*self.grid[j+1][i]+a*self.grid[j+1][i+1])
    def gradient(self,p):
        return ((self.sample((p[0]+1,p[1]))-self.sample((p[0]-1,p[1])))/2,(self.sample((p[0],p[1]+1))-self.sample((p[0],p[1]-1)))/2)

def heights(ref,edges,limit=3.,drop=5.25):
    n=len(ref); low=[v-limit for v in ref]; high=[v+limit for v in ref]; lo=list(low)
    # Longest-path bound propagation: exact feasibility test for this fixed graph.
    for iteration in range(n):
        changed=False
        for e in edges:
            a,b=e['rear'],e['front']; needed=lo[b]+drop
            if needed>lo[a]+1e-8: lo[a]=needed; changed=True
        if not changed: break
    feasible=not changed and all(a<=b+1e-7 for a,b in zip(lo,high))
    z=list(ref)
    if feasible:
        # Dykstra projection finds levels near terrain; feasible lo is a fallback.
        dual=[0.]*len(edges); box=[0.]*n
        for _ in range(180):
            for k,e in enumerate(edges):
                a,b=e['rear'],e['front']; ya=z[a]-dual[k]; yb=z[b]+dual[k]
                lam=max(0.,(drop-ya+yb)/2); z[a]=ya+lam; z[b]=yb-lam; dual[k]=lam
            for i in range(n):
                y=z[i]+box[i]; z[i]=max(low[i],min(high[i],y)); box[i]=y-z[i]
        if any(z[e['rear']]-z[e['front']]<drop-1e-6 for e in edges): z=lo
    else:
        # Bounded residual minimization supplies a useful local-search direction.
        degree=[0]*n
        for e in edges: degree[e['rear']]+=1; degree[e['front']]+=1
        step=.45/max(1,max(degree))
        for _ in range(70):
            grad=[0.]*n
            for e in edges:
                a,b=e['rear'],e['front']; short=max(0.,drop-z[a]+z[b]); grad[a]-=short; grad[b]+=short
            z=[max(low[i],min(high[i],z[i]-step*grad[i])) for i in range(n)]
    residual=[max(0.,drop-z[e['rear']]+z[e['front']]) for e in edges]
    return dict(z=z,feasible=feasible,shortfalls=residual,loss=sum(r*r for r in residual))

def evaluate(study,moves,terrain,cfg):
    units=study['units']; polys=[g.shifted(u['points'],d) for u,d in zip(units,moves)]
    if any(g.length(d)>cfg['max_move']+1e-8 or (u.get('fixed') and g.length(d)>1e-9) or not g.contains(study['boundary'],p) for u,d,p in zip(units,moves,polys)): return None
    for i,p in enumerate(polys):
        for q in polys[i+1:]:
            if all(g.gap(g.project(p,a),g.project(q,a)) < -1e-7 for a in g.axes(p)+g.axes(q)): return None
    edges=links(units,polys); ref=[terrain.sample(g.center(p)) for p in polys]
    h=heights(ref,edges,cfg['pad_limit'],cfg['drop'])
    cost=sum(g.dot(d,d) for d in moves)/(max(1,cfg['max_move'])**2)+sum((z-t)**2 for z,t in zip(h['z'],ref))/(max(.1,cfg['pad_limit'])**2)
    return dict(moves=[list(d) for d in moves],polys=polys,links=edges,reference=ref,**h,cost=cost)

def rank(r): return (0 if r['feasible'] else 1, 0 if r['feasible'] else r['loss'],r['cost'])

def candidates(study,state,terrain,cfg):
    units=study['units']; pairs=sorted(zip(state['shortfalls'],state['links']),key=lambda x:x[0],reverse=True)
    used=set()
    for short,e in pairs[:6]:
        if short<1e-6 and not state['feasible']: continue
        i,j=e['rear'],e['front']; vi=units[i]['view']; side=(vi[1],-vi[0])
        vectors=[]
        for axis in (side,vi):
            pa,pb=g.project(state['polys'][i],axis),g.project(state['polys'][j],axis)
            vectors.extend([g.mul(axis,pa[1]-pb[0]+.2),g.mul(axis,pa[0]-pb[1]-.2)])
        for size in (8.,4.,2.):
            vectors.extend(g.mul(axis,size*sign) for axis in (side,vi) for sign in (-1,1))
        # Each direction tries front-only, rear-only, and shared displacement.
        for delta in vectors:
            for share in (0.,1.,.5):
                ds=[list(d) for d in state['moves']]
                ds[i]=g.sub(ds[i],g.mul(delta,share)); ds[j]=g.add(ds[j],g.mul(delta,1-share))
                key=tuple(round(v,4) for d in ds for v in d)
                if key not in used: used.add(key); yield ds
    # For valid candidates, reduce prior movements without inventing new topology.
    if state['feasible']:
        for i,d in enumerate(state['moves']):
            if g.length(d)>.01:
                ds=[list(q) for q in state['moves']]; ds[i]=g.mul(d,.8); yield ds

def solve(study,terrain,cfg,progress=None):
    for key in ('max_move','pad_limit','drop','seconds'):
        if not math.isfinite(cfg[key]) or cfg[key]<=0: raise ValueError('Limits must be positive and finite')
    initial=evaluate(study,[(0.,0.) for u in study['units']],terrain,cfg)
    if initial is None: return dict(status='invalid_input',reason='Starting layout has overlaps, outside footprints, or invalid fixed state',initial=None,best=None,evaluations=1)
    best=initial; evaluations=1; passes=0; start=time.monotonic(); trace=[]
    while evaluations<cfg['evaluations'] and time.monotonic()-start<cfg['seconds']:
        chosen=best; improved=False
        for ds in candidates(study,best,terrain,cfg):
            if evaluations>=cfg['evaluations'] or time.monotonic()-start>=cfg['seconds']: break
            trial=evaluate(study,ds,terrain,cfg); evaluations+=1
            if trial is not None and rank(trial)<rank(chosen): chosen=trial; improved=True
        passes+=1
        if not improved: break
        best=chosen; trace.append(dict(pass_number=passes,loss=best['loss'],feasible=best['feasible'],cost=best['cost']))
        if progress: progress(dict(pass_number=passes,evaluations=evaluations,loss=best['loss'],feasible=best['feasible']))
        if best['feasible']: break
    return dict(status='valid' if best['feasible'] else 'unresolved',initial=initial,best=best,evaluations=evaluations,passes=passes,seconds=time.monotonic()-start,trace=trace,reason=None if best['feasible'] else 'No solution found within local-search limits; not proof that the plan is impossible')
