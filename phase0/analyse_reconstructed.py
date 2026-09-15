"""View reduction on the geometry-corrected image-flow layouts."""
import json, subprocess, sys
from run import ROOT, Terrain, g
from sight import spans, verify_new
from audit_reduction import facade_levels
from reduce_images import pair

OUT=ROOT/'output/checks/image-flow-analysis-20260915'

def main():
    src=json.loads((ROOT/'output/checks/image-flow-reconstruction-20260915/report.json').read_text(encoding='utf8'))
    if '--repair' in sys.argv:src=json.loads((OUT/'report.json').read_text(encoding='utf8'))
    old=json.loads((ROOT/'output/checks/image-reduction-20260915/report.json').read_text(encoding='utf8'))
    terrain=json.loads((ROOT/'output/checks/phase0/real-terrain-20260914-180335-reference.json').read_text(encoding='utf8'))['studies'][0]['terrain']
    t=Terrain.__new__(Terrain);t.__dict__.update(terrain);t.ny=len(t.grid);t.nx=len(t.grid[0])
    report=dict(boundary=src['boundary'],contours=src['contours'],rules=old['rules'],reference=old['reference'],stage='Verified view reduction of reconstructed image-flow geometry',layouts=[])
    OUT.mkdir(parents=True,exist_ok=True)
    for layout in src['layouts']:
        units=layout['units'];active=set(range(len(units)));history=[]
        for u in units:u['reference']=t.sample(g.center(u['points']))
        payload=dict(units=units,spans=spans(units),conflicts=[],outside=[])
        result=subprocess.run(['node',str(ROOT/'phase0/reduce_flow.js')],input=json.dumps(payload),text=True,capture_output=True,check=True)
        solved=json.loads(result.stdout);assert solved['valid']
        active={i for i,a in enumerate(solved['active']) if a};history=solved['history']
        ids=sorted(active);kept=[units[i] for i in ids]
        h=dict(z=[solved['z'][i] for i in ids],links=[])
        verification=verify_new(dict(boundary=src['boundary'],units=kept),h,t,{'pad_limit':1.5})
        verification['all_geometry_passed']=layout['verification']['passed']
        verification['downhill_passed']=all(facade_levels(u['center'],u['view'],t)[0]>facade_levels(u['center'],u['view'],t)[1]+1e-8 for u in units)
        verification['orientation_passed']=all(abs(u['rotation'])<=15+1e-8 for u in units)
        verification['standard_geometry_passed']=all(abs(abs(g.signed_area(u['points']))-253)<1e-6 for u in units)
        assert all(verification[k] for k in ('passed','all_geometry_passed','downhill_passed','orientation_passed','standard_geometry_passed')),verification
        for i,u in enumerate(units):
            u.update(active=i in active,reason='retained' if i in active else 'view / elevation',z=h['z'][ids.index(i)] if i in active else u['reference'])
        conflicts=[[i,j] for i,a in enumerate(units) for j,b in enumerate(units) if i<j and pair(a,b)]
        outside=[i for i,u in enumerate(units) if not g.contains(src['boundary'],u['points'])]
        assert not conflicts and not outside
        report['layouts'].append(dict(name=layout['name'],units=units,spans=spans(units),conflicts=conflicts,outside=outside,history=history,verification=verification,initial_count=len(units),retained_count=len(active),original_image_count=layout.get('original_count',layout.get('original_image_count'))))
        (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
        print(layout['name'],len(units),'->',len(active),'PASS',flush=True)

if __name__=='__main__':main()
