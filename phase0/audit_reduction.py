"""Record scale, live-source identity and footprint-scale downhill failures."""
import json,math,sys
from pathlib import Path
from run import ROOT,Terrain,g

def facade_levels(c,v,t):
    s=(v[1],-v[0])
    return [sum(t.sample(g.add(c,g.add(g.mul(v,d),g.mul(s,x)))) for x in (-5.5,0,5.5))/3 for d in (-11.5,11.5)]

if __name__=='__main__':
    folder=ROOT/'output/checks/image-reduction-20260915'
    report=json.loads((folder/'report.json').read_text(encoding='utf8'))
    reference=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335-reference.json').read_text(encoding='utf8'))
    t=Terrain.__new__(Terrain);t.__dict__.update(reference['studies'][0]['terrain']);t.ny=len(t.grid);t.nx=len(t.grid[0])
    audit=dict(site_area=abs(g.signed_area(report['boundary'])),site_extents=[max(p[k] for p in report['boundary'])-min(p[k] for p in report['boundary']) for k in (0,1)],layouts=[])
    for l in report['layouts']:
        failures=[];errors=[]
        for u in l['units']:
            rear,front=facade_levels(u['center'],u['view'],t)
            if front>=rear:failures.append(dict(id=u['id'],rear=rear,front=front,rise=front-rear))
            lengths=sorted(g.length(g.sub(a,b)) for a,b in g.edges(u['points']))
            if max(abs(a-b) for a,b in zip(lengths,[11,11,23,23]))>1e-6:errors.append(u['id'])
        audit['layouts'].append(dict(name=l['name'],uphill=failures,size_errors=errors))
    (folder/'audit-current.json').write_text(json.dumps(audit,indent=2),encoding='utf8')
    for l in audit['layouts']:print(l['name'],'uphill',len(l['uphill']),'size errors',len(l['size_errors']))
    print('site',audit['site_area'],audit['site_extents'])
