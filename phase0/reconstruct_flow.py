"""Adapt image arrangements to exact geometry with neighbour-preserving collective XY relaxation.

Geometry only: deliberately no view-cone reduction or pad fitting.
"""
import json,math,time
import numpy as np
from scipy.optimize import minimize
from scipy.spatial import cKDTree
from run import ROOT,Terrain,g,rectangle,contour_view
from audit_reduction import facade_levels
from checker import check
from PIL import Image,ImageDraw,ImageFont

OUT=ROOT/'output/checks/image-flow-reconstruction-20260915';OUT.mkdir(exist_ok=True)
SOURCE=ROOT/'output/checks/image-reduction-20260915/extracted.json'

def orient(c,axis,contours,t):
    normal=contour_view(c,contours,t)
    rear,front=facade_levels(c,normal,t)
    if front>rear:normal=g.mul(normal,-1)
    if g.dot(axis,normal)<0:axis=g.mul(axis,-1)
    preferred=max(-15,min(15,math.degrees(math.atan2(g.cross(normal,axis),g.dot(normal,axis)))))
    for turn in sorted(set([preferred,-15,-7.5,0,7.5,15]),key=lambda a:abs(a-preferred)):
        a=math.radians(turn);v=[normal[0]*math.cos(a)-normal[1]*math.sin(a),normal[0]*math.sin(a)+normal[1]*math.cos(a)]
        rear,front=facade_levels(c,v,t)
        if front<rear-1e-8:return v,turn,rear-front
    raise ValueError('No downhill orientation')

def relax(centres,original,views,boundary,neighbours,weight):
    n=len(centres);ii,jj=np.triu_indices(n,1);v=np.asarray(views);s=np.c_[v[:,1],-v[:,0]]
    axes=np.stack([s[ii],v[ii],s[jj],v[jj]],axis=1)
    support=(np.abs(np.einsum('pad,pd->pa',axes,s[ii]))+np.abs(np.einsum('pad,pd->pa',axes,s[jj])))*5.5+(np.abs(np.einsum('pad,pd->pa',axes,v[ii]))+np.abs(np.einsum('pad,pd->pa',axes,v[jj])))*11.5
    target=support+np.array([3.2,.15,3.2,.15])
    corners=np.array([s*(-5.5)+v*(-11.5),s*5.5-v*11.5,s*5.5+v*11.5,-s*5.5+v*11.5]).transpose(1,0,2)
    offsets=np.concatenate([corners*(1-f)+np.roll(corners,-1,axis=1)*f for f in [0,.25,.5,.75]],axis=1)
    ba=np.asarray(boundary);bb=np.roll(ba,-1,axis=0);bv=bb-ba;den=np.sum(bv*bv,axis=1)
    ni,nj=np.asarray(neighbours).T
    def objective(flat):
        c=flat.reshape(n,2);grad=np.zeros_like(c);delta=c[jj]-c[ii]
        proj=np.einsum('pd,pad->pa',delta,axes);short=target-np.abs(proj)
        choice=np.stack([np.argmin(short[:,:2],axis=1),2+np.argmin(short[:,2:],axis=1)],axis=1)
        loss=0.
        for frame in range(2):
            k=choice[:,frame];r=np.maximum(0,short[np.arange(len(ii)),k]);a=axes[np.arange(len(ii)),k];sign=np.where(proj[np.arange(len(ii)),k]>=0,1.,-1.)
            force=2*weight*r[:,None]*a*sign[:,None];np.add.at(grad,ii,force);np.add.at(grad,jj,-force);loss+=weight*np.sum(r*r)
        p=(c[:,None,:]+offsets).reshape(-1,2);qdelta=p[:,None,:]-ba
        f=np.clip(np.sum(qdelta*bv,axis=2)/den,0,1);q=ba+f[:,:,None]*bv
        ds=p[:,None,:]-q;d2=np.sum(ds*ds,axis=2);edge=np.argmin(d2,axis=1);d=np.sqrt(d2[np.arange(len(p)),edge]+1e-20)
        cross=((ba[None,:,1]>p[:,None,1])!=(bb[None,:,1]>p[:,None,1]))&(p[:,None,0] < ba[None,:,0]+(p[:,None,1]-ba[None,:,1])*bv[None,:,0]/np.where(np.abs(bv[:,1])<1e-12,1e-12,bv[:,1]))
        sign=np.where(np.sum(cross,axis=1)%2,1.,-1.);r=np.maximum(0,.12-sign*d)
        direction=ds[np.arange(len(p)),edge]/d[:,None];force=-2*weight*r[:,None]*sign[:,None]*direction
        grad+=force.reshape(n,-1,2).sum(axis=1);loss+=weight*np.sum(r*r)
        displacement=c-original;loss+=.025*np.sum(displacement**2);grad+=.05*displacement
        relative=displacement[ni]-displacement[nj];loss+=.065*np.sum(relative**2);np.add.at(grad,ni,.13*relative);np.add.at(grad,nj,-.13*relative)
        return loss,grad.ravel()
    result=minimize(objective,centres.ravel(),jac=True,method='L-BFGS-B',bounds=[(x-38,x+38) for x in original.ravel()],options={'maxiter':300,'ftol':1e-10,'gtol':1e-5,'maxls':35})
    return result.x.reshape(n,2)

def main():
    ref=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335-reference.json').read_text(encoding='utf8'));study=ref['studies'][0]['source'];boundary=study['boundary'];contours=study['contours']
    terrain=Terrain.__new__(Terrain);terrain.__dict__.update(ref['studies'][0]['terrain']);terrain.ny=len(terrain.grid);terrain.nx=len(terrain.grid[0])
    raw=json.loads(SOURCE.read_text(encoding='utf8'));report=dict(boundary=boundary,contours=contours,stage='Geometry reconstruction only; views and pad elevations NOT assessed',layouts=[])
    for layout in raw['layouts']:
        originals={u['id']:u for u in layout['units']};ids=list(originals);centres=np.array([originals[k]['center'] for k in ids]);removed=[];hints={k:originals[k]['image_axis'] for k in ids}
        for attempt in range(4):
            best=None
            original=np.array([originals[k]['center'] for k in ids]);tree=cKDTree(original);near=tree.query(original,k=min(5,len(ids)))[1]
            neighbours=sorted({tuple(sorted((i,int(j)))) for i,row in enumerate(near) for j in row[1:]})
            for iteration in range(8):
                oriented=[orient(c,hints[k],contours,terrain) for c,k in zip(centres,ids)]
                centres=relax(centres,original,[o[0] for o in oriented],boundary,neighbours,100+100*iteration)
                units=[]
                for c,k in zip(centres,ids):
                    v,turn,drop=orient(c,oriented[ids.index(k)][0],contours,terrain);hints[k]=v
                    units.append(dict(id=k,name=k,center=c.tolist(),points=rectangle(c,v,11,23),view=v,rotation=turn,downhill_drop=drop,original_center=originals[k]['center'],movement=float(np.linalg.norm(c-originals[k]['center']))))
                validation=check(dict(boundary=boundary,units=units),{})
                key=(len(validation['issues']),sum(u['movement']**2 for u in units))
                if best is None or key<best[0]:best=(key,centres.copy(),units,validation)
                print(layout['name'],'units',len(ids),'pass',iteration,'issues',len(validation['issues']),flush=True)
                if validation['passed']:break
            if validation['passed']:break
            _,centres,units,validation=best;hints={u['id']:u['view'] for u in units}
            if attempt==3:break
            # Delete only after collective relaxation, and only a conflict participant.
            degree={k:0 for k in ids}
            for e in validation['issues']:
                for field in ['a','b','building']:
                    if e.get(field) in degree:degree[e[field]]+=1
            victim=max(ids,key=lambda k:(degree[k],k));i=ids.index(victim);removed.append(victim);ids.pop(i);centres=np.delete(centres,i,axis=0)
        # The shown geometry is strictly valid even if the bounded local search stalls.
        while not validation['passed']:
            degree={u['id']:0 for u in units}
            for e in validation['issues']:
                for field in ['a','b','building']:
                    if e.get(field) in degree:degree[e[field]]+=1
            victim=max(degree,key=lambda k:(degree[k],k));removed.append(victim);units=[u for u in units if u['id']!=victim]
            validation=check(dict(boundary=boundary,units=units),{})
        result=dict(name=layout['name'],units=units,original_count=len(layout['units']),removed_for_geometry=removed,verification=validation)
        report['layouts'].append(result);(OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');render(report)
    return report

def render(report):
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',25);small=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',16);tiles=[]
    for layout in report['layouts']:
        im=Image.new('RGB',(1200,1500),'#ffffff');d=ImageDraw.Draw(im);b=report['boundary'];xs,ys=zip(*b);s=min(1080/(max(xs)-min(xs)),1250/(max(ys)-min(ys)))
        def xy(p):return (60+(p[0]-min(xs))*s,115+(max(ys)-p[1])*s)
        d.text((60,28),layout['name'].replace('-',' ').title(),fill='#163642',font=font)
        status='clearance verified' if layout['verification']['passed'] else 'geometry conflicts remain'
        d.text((60,65),f"{len(layout['units'])} villas | 11 x 23 m | {status}",fill='#526976',font=small)
        for c in report['contours']:d.line([xy(p) for p in c['points']],fill='#d6dfdc',width=1)
        d.line([xy(p) for p in b+[b[0]]],fill='#284c55',width=3)
        for u in layout['units']:
            d.polygon([xy(p) for p in u['points']],fill='#c5dfcf',outline='#32745e',width=2);c=u['center'];v=u['view'];side=[v[1],-v[0]]
            arrow=[[c[0]+v[0]*a+side[0]*k,c[1]+v[1]*a+side[1]*k] for a,k in [(9,0),(6,1),(6,-1)]]
            d.polygon([xy(p) for p in arrow],fill='#32745e');d.text(xy(c),u['id'],anchor='mm',fill='#163642',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',12))
        d.text((60,1410),'Image flow preserved with coordinated position adjustments',fill='#526976',font=small)
        d.text((60,1440),'Geometry only — no view / elevation reduction',fill='#526976',font=small)
        im.save(OUT/(layout['name']+'.png'));tiles.append(im.resize((600,750)))
    sheet=Image.new('RGB',(1200,1500),'#eff3f2')
    for i,tile in enumerate(tiles):sheet.paste(tile,((i%2)*600,(i//2)*750))
    sheet.save(OUT/'comparison.png')

def refill():
    """Recover omitted image units in nearby usable gaps; never invent new units."""
    from shapely.geometry import Polygon
    report=json.loads((OUT/'report.json').read_text(encoding='utf8'));raw=json.loads(SOURCE.read_text(encoding='utf8'))
    ref=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335-reference.json').read_text(encoding='utf8'))
    t=Terrain.__new__(Terrain);t.__dict__.update(ref['studies'][0]['terrain']);t.ny=len(t.grid);t.nx=len(t.grid[0]);site=Polygon(report['boundary']).buffer(-.08)
    offsets=sorted([(dx,dy) for dx in range(-32,33,2) for dy in range(-32,33,2) if dx*dx+dy*dy<=32**2],key=lambda d:d[0]*d[0]+d[1]*d[1])
    for layout in report['layouts']:
        originals={u['id']:u for l in raw['layouts'] if l['name']==layout['name'] for u in l['units']};units=layout['units'];recovered=[]
        for key in sorted(layout['removed_for_geometry']):
            old=originals[key];centers=np.array([u['center'] for u in units]);vv=np.array([u['view'] for u in units]);ss=np.c_[vv[:,1],-vv[:,0]]
            for dx,dy in offsets:
                c=np.array(old['center'])+[dx,dy]
                if not site.contains(Polygon(rectangle(c,[0,1],2,2))):continue
                v,turn,drop=orient(c,old['image_axis'],report['contours'],t);v=np.array(v);s=np.array([v[1],-v[0]]);delta=centers-c
                support_side=5.5+np.abs(ss@s)*5.5+np.abs(vv@s)*11.5
                support_depth=11.5+np.abs(ss@v)*5.5+np.abs(vv@v)*11.5
                if np.any((np.abs(delta@v)<support_depth+.08)&(np.abs(delta@s)<support_side+3.1)):continue
                support_side=5.5+np.abs(ss@s)*5.5+np.abs(ss@v)*11.5
                support_depth=11.5+np.abs(vv@s)*5.5+np.abs(vv@v)*11.5
                if np.any((np.abs(np.sum(delta*vv,axis=1))<support_depth+.08)&(np.abs(np.sum(delta*ss,axis=1))<support_side+3.1)):continue
                points=rectangle(c,v,11,23)
                if not site.contains(Polygon(points)):continue
                units.append(dict(id=key,name=key,center=c.tolist(),points=points,view=v.tolist(),rotation=turn,downhill_drop=drop,original_center=old['center'],movement=math.hypot(dx,dy)));recovered.append(key);break
        layout['removed_for_geometry']=[k for k in layout['removed_for_geometry'] if k not in recovered]
        layout['units']=sorted(units,key=lambda u:u['id']);layout['verification']=check(dict(boundary=report['boundary'],units=units),{});assert layout['verification']['passed']
        print('Recovered',layout['name'],len(recovered),'total',len(units),flush=True)
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8');render(report)

if __name__=='__main__':
    main()
    refill()
