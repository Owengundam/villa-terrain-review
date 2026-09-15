"""Rhino Python 3 entry point. Default: dry run. Optional PHASE2_MODE='apply'."""
import os, sys, json, datetime, importlib, html

def project_root(doc):
    folder=os.path.dirname(doc.Path)
    while folder:
        if os.path.isfile(os.path.join(folder,'phase2','solver.py')): return folder
        parent=os.path.dirname(folder)
        if parent==folder: break
        folder=parent
    raise ValueError('Save the Rhino document inside this planning workspace first')

def run(doc,mode='dry-run',config=None):
    if mode not in ('dry-run','apply'): raise ValueError('Mode must be dry-run or apply')
    root=project_root(doc); folder=os.path.join(root,'phase2')
    if folder not in sys.path: sys.path.insert(0,folder)
    import geometry, checker, solver, model_geometry
    for module in (geometry,checker,solver,model_geometry): importlib.reload(module)
    before=model_geometry.snapshot(doc)
    cfg=solver.settings(**dict({'tolerance':before['tolerance']},**(config or {})))
    results=[solver.solve(s,cfg) for s in before['studies']]
    if model_geometry.fingerprint(doc)!=before['fingerprint']: raise RuntimeError('Document changed during calculation')
    report=dict(source=before,results=results,mode=mode,rule='Directional side gap >3 m in both local frames; no overlaps; XY only',all_valid=all(r['status']=='valid' for r in results),unchanged=True)
    stamp=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    dest=os.path.join(root,'output','checks','phase2',stamp); os.makedirs(dest,exist_ok=True)
    preview_cards=[]
    for s,r in zip(before['studies'],results):
        # Portable plan preview, independent of Rhino viewport and layer state.
        pts=s['boundary']; xmin=min(p[0] for p in pts); ymin=min(p[1] for p in pts); w=max(p[0] for p in pts)-xmin; h=max(p[1] for p in pts)-ymin
        def path(poly): return ' '.join('%.4f,%.4f'%(p[0]-xmin,h-(p[1]-ymin)) for p in poly)
        svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -10 %f %f"><rect x="-10" y="-10" width="100%%" height="100%%" fill="white"/><polygon points="%s" fill="none" stroke="#333" stroke-width=".5"/>'%(w+20,h+20,path(pts))]
        failed={v for issue in r['final']['issues'] for k,v in issue.items() if k in ('a','b','building')}
        for u in s['units']:
            old=u['points']; new=geometry.shifted(old,r['moves'][u['id']]); c=geometry.center(new)
            svg.append('<polygon points="%s" fill="none" stroke="#aaa" stroke-width=".3" stroke-dasharray="1 1"/><polygon points="%s" fill="%s" stroke="#26734a" stroke-width=".4"/><text x="%f" y="%f" font-size="2">%s</text>'%(path(old),path(new),'#f3b1a8' if u['id'] in failed else '#dceadd',c[0]-xmin,h-c[1]+ymin,html.escape(u['name'])))
            a=geometry.center(old)
            svg.append('<line x1="%f" y1="%f" x2="%f" y2="%f" stroke="#b64c35" stroke-width=".4"/>'%(a[0]-xmin,h-a[1]+ymin,c[0]-xmin,h-c[1]+ymin))
        svg.append('</svg>')
        with open(os.path.join(dest,s['id']+'.svg'),'w',encoding='utf-8') as f: f.write(''.join(svg))
        preview_cards.append('<section><h2>%s</h2><p>%s · %s initial issues → %s remaining</p><img src="%s.svg" alt="Proposed plan"/></section>'%(html.escape(s['name']),r['status'],len(r['initial']['issues']),len(r['final']['issues']),s['id']))
    with open(os.path.join(dest,'index.html'),'w',encoding='utf-8') as f:
        f.write('<!doctype html><meta charset="utf-8"><title>Phase 2 preview</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;background:#f6f5f0;color:#283b31}section{display:inline-block;vertical-align:top;width:47%;padding:1%;background:white;margin:.4%}img{width:100%}h2{font-size:18px}</style><h1>Phase 2 — planar clearance</h1><p>Dry-run proposal. Dashed outlines: original positions. Green: verified footprints. Red: unresolved footprints. Rust lines: movements. Orientations and heights are fixed.</p><p><a href="report.json">Detailed report and exact movements</a></p>'+''.join(preview_cards))
    # Persist the exact proposal before any application.
    report_path=os.path.join(dest,'report.json')
    with open(report_path,'w',encoding='utf-8') as f: json.dump(report,f,indent=2)
    if mode=='apply':
        report['application']=model_geometry.apply(doc,before,results,os.path.join(root,'output','_backups'))
        report['unchanged']=not report['application']['applied']
        with open(report_path,'w',encoding='utf-8') as f: json.dump(report,f,indent=2)
    summary=dict(report=report_path,mode=mode,all_valid=report['all_valid'],document_unchanged=report['unchanged'],studies=[dict(name=s['name'],buildings=len(s['units']),status=r['status'],before_issues=len(r['initial']['issues']),after_issues=len(r['final']['issues']),minimum_gap=r['final']['minimum_directional_gap'],moved_buildings=sum(geometry.length(d)>1e-8 for d in r['moves'].values()),maximum_move=max(geometry.length(d) for d in r['moves'].values())) for s,r in zip(before['studies'],results)])
    print(json.dumps(summary)); return report

if '__rhino_doc__' in globals():
    run(__rhino_doc__,globals().get('PHASE2_MODE','dry-run'),globals().get('PHASE2_SETTINGS'))
