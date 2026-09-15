"""Offline bounded local search on an explicit, read-only Rhino export."""
import argparse,json,os,datetime,html
from core import Terrain,solve
from verify import verify

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('input'); ap.add_argument('--max-move',type=float,default=20.)
    ap.add_argument('--pad-limit',type=float,default=3.); ap.add_argument('--evaluations',type=int,default=1200)
    ap.add_argument('--seconds',type=float,default=120.); args=ap.parse_args()
    with open(args.input,encoding='utf-8-sig') as f: data=json.load(f)
    cfg=dict(max_move=args.max_move,pad_limit=args.pad_limit,drop=5.25,evaluations=args.evaluations,seconds=args.seconds)
    dest=os.path.join(os.path.dirname(args.input),datetime.datetime.now().strftime('%Y%m%d-%H%M%S')); os.makedirs(dest,exist_ok=False)
    output=dict(schema=1,phase='2 — views and elevations',source_path=data['path'],source_fingerprint=data['fingerprint'],config=cfg,reference='8 m bilinear grid from nearest two distinct live 3D contour levels; synthetic concept terrain',studies=[])
    for study in data['studies']:
        print('Building terrain reference: '+study['name'],flush=True)
        terrain=Terrain(study)
        result=solve(study,terrain,cfg,lambda event:print(json.dumps(dict(option=study['name'],**event)),flush=True))
        result['verification']=verify(study,result['best'],terrain,cfg)
        if result['status']=='valid' and not result['verification']['passed']: result['status']='verification_failed'
        output['studies'].append(dict(source=study,result=result,terrain=dict(x0=terrain.x0,y0=terrain.y0,spacing=terrain.spacing,grid=terrain.grid)))
        with open(os.path.join(dest,'report.json'),'w',encoding='utf-8') as f: json.dump(output,f,indent=2)
        print(json.dumps(dict(option=study['name'],status=result['status'],evaluations=result['evaluations'],remaining=len(result['verification']['issues']))),flush=True)
    template_path=os.path.join(os.path.dirname(__file__),'viewer.html')
    with open(template_path,encoding='utf-8') as f: template=f.read()
    payload=json.dumps(output,separators=(',',':')).replace('<','\\u003c')
    fragment=template.replace('/*REPORT_DATA*/{}',payload)
    with open(os.path.join(dest,'viewer-fragment.html'),'w',encoding='utf-8') as f: f.write(fragment)
    css=':root{color-scheme:light dark;--foreground:light-dark(#243b32,#e4ece6);--background:light-dark(#f8f7f2,#19251f);--border:light-dark(#c2c9c0,#536257);--muted-foreground:light-dark(#58685e,#a4b5a8);--viz-series-1:light-dark(#23764e,#78cfa1);--viz-series-2:light-dark(#a93d32,#fb9c89);--viz-series-3:light-dark(#3b6d9d,#87b4eb);--font-size-base:16px}body{background:var(--background);color:var(--foreground);font:16px/1.5 system-ui;margin:30px auto;max-width:1150px;padding:20px}select,button{font:inherit;padding:7px;color:inherit;background:var(--background);border:1px solid var(--border)}.viz-controls{display:flex;flex-wrap:wrap;gap:18px;align-items:center}.form-label{display:flex;align-items:center;gap:8px}.text-small{font-size:13px}.text-muted{color:var(--muted-foreground)}'
    with open(os.path.join(dest,'index.html'),'w',encoding='utf-8') as f: f.write('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Phase 2 — views and elevations</title><style>'+css+'</style>'+fragment+'</html>')
    print('RESULT '+os.path.abspath(dest),flush=True)

if __name__=='__main__': main()
