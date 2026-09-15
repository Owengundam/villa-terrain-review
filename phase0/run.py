"""Generate compact, regular villa-only plans; reject every infeasible candidate."""
import argparse, datetime, json, math, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'view_elevation'))
from core import Terrain, g, links, heights
from sight import fit, verify_new as verify

def rectangle(c,v,width,depth):
    s=(v[1],-v[0])
    return [g.add(c,g.add(g.mul(s,x*width/2),g.mul(v,y*depth/2))) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]]

def feasible(ref,edges,limit,drop):
    z=[r-limit for r in ref]
    for _ in range(len(z)+1):
        changed=False
        for e in edges:
            a,b=e['rear'],e['front']
            if z[a]<z[b]+drop-1e-9:
                z[a]=z[b]+drop; changed=True
                if z[a]>ref[a]+limit+1e-8:return False
        if not changed:return True
    return False

_segments={}
def contour_view(c,contours,terrain):
    key=id(contours)
    if key not in _segments:
        es=[]
        for line in contours:
            for a,b in zip(line['points'],line['points'][1:]):
                dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy
                if den>1e-16:es.append((a[0],a[1],dx,dy,den,min(a[0],b[0]),max(a[0],b[0]),min(a[1],b[1]),max(a[1],b[1])))
        _segments[key]=(contours,es)
    best=math.inf; tangent=None;px,py=c
    for x,y,dx,dy,den,xlo,xhi,ylo,yhi in _segments[key][1]:
        bx=max(xlo-px,0,px-xhi);by=max(ylo-py,0,py-yhi)
        if bx*bx+by*by>=best:continue
        f=max(0,min(1,((px-x)*dx+(py-y)*dy)/den))
        dist=(px-x-f*dx)**2+(py-y-f*dy)**2
        if dist<best:best=dist;tangent=(dx/math.sqrt(den),dy/math.sqrt(den))
    if tangent is None:raise ValueError('No usable contour segments')
    normal=(tangent[1],-tangent[0]); gradient=terrain.gradient(c)
    if g.length(gradient)<1e-8:raise ValueError('Undefined downhill direction at villa center')
    return g.mul(normal,-1 if g.dot(normal,gradient)>0 else 1)

def layout(boundary,v,width,depth,pitch,stagger,offset,contours=None,terrain=None,side_extra=0.):
    s=(v[1],-v[0]); sx=g.project(boundary,s); sy=g.project(boundary,v)
    units=[]; across=width+3.05+side_extra
    for row in range(math.ceil((sy[1]-sy[0])/pitch)+1):
        y=sy[0]+depth/2+(row+offset)*pitch
        for col in range(math.ceil((sx[1]-sx[0])/across)+1):
            x=sx[0]+width/2+(col+offset+(row%2)*stagger)*across
            c=g.add(g.mul(s,x),g.mul(v,y))
            if not g.inside(c,boundary):continue
            local=contour_view(c,contours,terrain) if contours else v
            poly=rectangle(c,local,width,depth)
            if g.contains(boundary,poly):
                name='V%03d'%(len(units)+1)
                units.append(dict(id=name,name=name,points=poly,view=local,fixed=False,row=row))
    return units

def trim_conflicts(units,boundary,terrain):
    """Retain regular candidate positions, omitting only conflict participants."""
    from checker import check
    while units:
        issues=check(dict(boundary=boundary,units=units),{})['issues']
        counts={u['id']:0 for u in units}
        for e in issues:
            for key in ('a','b','building'):
                if e.get(key) in counts:counts[e[key]]+=1
        if issues:
            remove=max(counts,key=lambda k:(counts[k],k))
        else:
            h=fit(units,terrain);edges=h['links']
            if h['feasible']:break
            for e,short in zip(edges,h['shortfalls']):
                for k in (e['rear'],e['front']):counts[units[k]['id']]+=short
            remove=max(counts,key=lambda k:(counts[k],k))
        units=[u for u in units if u['id']!=remove]
    return units

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source',default='output/checks/view-elevation/20260914-152538/report.json');ap.add_argument('--wide',action='store_true',help='Test wider row and lateral spacing when the compact family is infeasible');ap.add_argument('--repair',action='store_true',help='Omit conflict participants from compact regular candidate rows');args=ap.parse_args()
    data=json.loads((ROOT/args.source).read_text(encoding='utf8')); source=data['studies'][0]
    study=source['source']; t=Terrain.__new__(Terrain)
    for k,v in source['terrain'].items():setattr(t,k,v)
    t.ny=len(t.grid);t.nx=len(t.grid[0])
    u=next(u for u in study['units'] if u['name'].startswith('V'))
    v=u['view'];s=(v[1],-v[0]);width=round(g.project(u['points'],s)[1]-g.project(u['points'],s)[0],2);depth=round(g.project(u['points'],v)[1]-g.project(u['points'],v)[0],2)
    center=g.center(study['boundary']); grad=t.gradient(center)
    # Average the field gradient to avoid selecting a direction from one contour artifact.
    grads=[t.gradient(g.center([a,b,center])) for a,b in g.edges(study['boundary'])]
    gx=sum(x for x,y in grads);gy=sum(y for x,y in grads)
    angle=math.atan2(-gy,-gx) if math.hypot(gx,gy)>1e-6 else -math.pi/2
    dest=ROOT/'output/checks/phase0'/datetime.datetime.now().strftime('%Y%m%d-%H%M%S');dest.mkdir(parents=True)
    report=dict(phase=0,source=args.source,reference=data['reference'],unit=dict(width=width,depth=depth),rules=dict(side_gap=3.05,minimum_row_gap=5.05,pad_limit=3.,drop=5.25,orientation='Main view perpendicular to nearest contour segment, facing downhill'),strategies=[])
    cfg=dict(max_move=1.,pad_limit=3.,drop=5.25)
    report['rules']['view_rule']='central +/-15 degrees; >=70% clear angular width; union of obstructions; vertical clearance alternative 5.25 m'
    report['generation_mode']='compact rows with conflict omissions' if args.repair else 'wide regular rows' if args.wide else 'complete compact regular rows'
    for name,stagger in [('Parallel rows',0.),('Staggered rows',.5)]:
        best=None; tested=0
        for turn in [0,-10,10]:
            a=angle+math.radians(turn);v=[math.cos(a),math.sin(a)]
            for extra in (range(40,121,10) if args.wide else range(0,41,8) if args.repair else range(0,41,2)):
                pitch=depth+5.05+extra
                for offset,side_extra in ((o,e) for e in ([18.,24.,30.,40.] if args.wide else [0.,4.,8.] if args.repair else [0.,2.,4.,6.,8.,10.,14.,18.]) for o in [0.,.5]):
                    units=layout(study['boundary'],v,width,depth,pitch,stagger,offset,study['contours'],t,side_extra)
                    if args.repair:units=trim_conflicts(units,study['boundary'],t)
                    tested+=1
                    if not units or (best and len(units)<len(best['source']['units'])):continue
                    from checker import check
                    if not check(dict(boundary=study['boundary'],units=units),{})['passed']:continue
                    state=fit(units,t)
                    if not state['feasible']:continue
                    h=state;ref=state['reference']
                    proposal=dict(name=name,boundary=study['boundary'],contours=study['contours'],units=units)
                    validation=verify(proposal,state,t,cfg)
                    if not validation['passed'] or validation['clearance_cleanup_issues']:continue
                    cost=sum((z-r)**2 for z,r in zip(h['z'],ref))
                    key=(-len(units),cost,pitch)
                    if best is None or key<tuple(best['rank']):
                        validation['orientation_passed']=all(g.dot(u['view'],contour_view(g.center(u['points']),study['contours'],t))>1-1e-10 for u in units)
                        if not validation['orientation_passed']:continue
                        best=dict(name=name,source=proposal,state=state,verification=validation,rank=key,row_pitch=pitch,across_pitch=width+3.05+side_extra,angle_degrees=math.degrees(a),offset=offset)
                        print(name,len(units),'villas; row pitch',pitch,'PASS',flush=True)
        if best is None:best=dict(name=name,status='no_feasible_layout_found')
        else:best['status']='verified'
        best['candidates_tested']=tested;report['strategies'].append(best)
    (dest/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    from preview import render
    render(report,dest)
    print('RESULT',dest,flush=True)

if __name__=='__main__':main()
