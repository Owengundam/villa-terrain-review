"""Bounded, deterministic multi-start XY clearance search. No Rhino dependency."""
import math, time
import geometry as g
from checker import check

def settings(clearance=3.,margin=.05,max_move=6.,max_passes=60,starts=3,time_limit=30.,tolerance=.001):
    values=(clearance,margin,max_move,time_limit,tolerance)
    if not all(math.isfinite(x) for x in values) or clearance<0 or margin<=2*tolerance or max_move<0 or tolerance<=0 or time_limit<=0:
        raise ValueError('Invalid limits or margin (must exceed twice tolerance)')
    if not isinstance(max_passes,int) or not 1<=max_passes<=1000 or not isinstance(starts,int) or not 1<=starts<=10: raise ValueError('Invalid search limits')
    return dict(clearance=clearance,margin=margin,max_move=max_move,max_passes=max_passes,starts=starts,time_limit=time_limit,tolerance=tolerance)

def metrics(study,ds,target):
    units=study['units']; ps=[g.shifted(u['points'],d) for u,d in zip(units,ds)]
    conflicts=[]; violation=0.
    for i in range(len(units)):
        for j in range(i+1,len(units)):
            pair=0.
            sep=max(g.gap(g.project(ps[i],a),g.project(ps[j],a)) for a in g.axes(ps[i])+g.axes(ps[j]))
            if sep<0: pair+=sep*sep
            for a,b in ((i,j),(j,i)):
                v=units[a]['view']; side=(v[1],-v[0]); depth=g.gap(g.project(ps[a],v),g.project(ps[b],v))
                if depth < -1e-8:
                    short=max(0.,target-g.gap(g.project(ps[a],side),g.project(ps[b],side)))
                    # The relationship can be solved by side separation OR depth separation.
                    pair+=min(short,-depth+target*.01)**2
            if pair>1e-12: conflicts.append((pair,i,j)); violation+=pair
    return violation, sum(g.dot(d,d)*u.get('weight',1.) for d,u in zip(ds,units)), sorted(conflicts,reverse=True), ps

def alternatives(pi,pj,ui,uj,target):
    directions=g.axes(pi)+g.axes(pj)+[ui['view'],uj['view']]
    result=[]
    for axis in directions:
        a,b=g.project(pi,axis),g.project(pj,axis)
        for distance in (target, .002):
            result.extend([g.mul(axis,a[1]-b[0]+distance),g.mul(axis,a[0]-b[1]-distance)])
    return result

def solve(study, cfg=None):
    cfg=settings(**(cfg or {})); units=study['units']; target=cfg['clearance']+cfg['margin']
    g.validate_polygon(study['boundary'])
    if not units or len({u['id'] for u in units})!=len(units): raise ValueError('Missing or duplicate building IDs')
    for u in units:
        g.validate_polygon(u['points'],convex=True)
        if abs(g.length(u['view'])-1)>1e-6 or u.get('weight',1.)<=0: raise ValueError('Invalid view or weight')
    zero={u['id']:[0.,0.] for u in units}; check_args={k:cfg[k] for k in ('clearance','margin','max_move','tolerance')}
    initial=check(study,zero,**check_args)
    if initial['passed']: return dict(status='valid',moves=zero,initial=initial,final=initial,cost=0.,passes=0,candidates=1,optimality='Zero movement is optimal for this objective',settings=cfg)
    # Outside inputs are explicit unresolved cases; no speculative boundary projection.
    if any(i['kind']=='outside_boundary' for i in initial['issues']):
        return dict(status='unresolved',moves=zero,initial=initial,final=initial,reason='Starting footprint outside boundary; repair or explicitly revise input',settings=cfg)
    deadline=time.monotonic()+cfg['time_limit']; candidates=[]; best=None
    for run in range(cfg['starts']):
        ds=[(0.,0.) for u in units]; count=0
        for iteration in range(cfg['max_passes']):
            count=iteration+1
            base=metrics(study,ds,target)
            if base[0]<1e-12 or time.monotonic()>deadline: break
            changed=False
            pairs=base[2] if run%2==0 else list(reversed(base[2]))
            for _,i,j in pairs:
                if time.monotonic()>deadline: break
                base=metrics(study,ds,target); choice=None
                for delta in alternatives(base[3][i],base[3][j],units[i],units[j],target):
                    shares=([.5,0.,1.] if run==0 else ([0.,1.,.5] if run==1 else [1.,.5,0.]))
                    for share in shares:
                        nd=list(ds); nd[i]=g.sub(ds[i],g.mul(delta,share)); nd[j]=g.add(ds[j],g.mul(delta,1-share))
                        if any(g.length(nd[k])>cfg['max_move']+1e-9 or (units[k].get('fixed') and g.length(nd[k])>1e-9) or not g.contains(study['boundary'],g.shifted(units[k]['points'],nd[k])) for k in (i,j)): continue
                        m=metrics(study,nd,target); rank=(m[0],m[1])
                        if m[0]<base[0]-1e-10 and (choice is None or rank<choice[0]): choice=(rank,nd)
                if choice: ds=choice[1]; changed=True
            if not changed: break
        moves={u['id']:list(d) for u,d in zip(units,ds)}; result=check(study,moves,**check_args)
        m=metrics(study,ds,target)
        candidate=dict(status='valid' if result['passed'] else 'unresolved',moves=moves,initial=initial,final=result,cost=m[1],passes=count,settings=cfg)
        rank=(not result['passed'],m[0],m[1])
        if best is None or rank<best[0]: best=(rank,candidate)
        if result['passed']: candidates.append(candidate)
        if time.monotonic()>deadline: break
    result=best[1]; result['candidates']=len(candidates); result['optimality']='Best valid candidate found; global optimality and infeasibility are not proven'
    if result['status']!='valid': result['reason']='Search stalled or reached time/movement limits; no valid solution found'
    result['alternatives']=[dict(cost=c['cost'],moves=c['moves']) for c in sorted(candidates,key=lambda c:c['cost'])[:3]]
    return result
