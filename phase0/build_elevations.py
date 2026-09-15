"""Build elevation review from an existing verified Phase 0 report."""
import json,sys
from pathlib import Path
folder=Path(sys.argv[1])
report=json.loads((folder/'report.json').read_text(encoding='utf8'))
data=[]
for r in report['strategies']:
    if r['status']!='verified':continue
    s=r['source'];state=r['state']
    data.append(dict(name=r['name'],units=s['units'],boundary=s['boundary'],contours=s['contours'],links=state['links'],z=state['z'],ref=state['reference'],clear_fraction=state.get('clear_fraction')))
fragment=Path(__file__).with_name('elevations.html').read_text(encoding='utf8').replace('/*DATA*/[]',json.dumps(data,separators=(',',':')).replace('<','\\u003c'))
(folder/'elevations-fragment.html').write_text(fragment,encoding='utf8')
style=':root{--foreground:#22372f;--border:#ccd4d0;--viz-series-1:#416f98;--viz-series-3:#9b6c40}body{font:16px system-ui;color:var(--foreground);max-width:1100px;margin:30px auto;padding:16px}select{font:inherit;max-width:100%;padding:6px}.viz-controls{display:flex;gap:16px;flex-wrap:wrap}.form-label{display:flex;gap:8px;align-items:center}.text-small{font-size:13px}'
(folder/'elevations.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Villa elevations</title><style>'+style+'</style>'+fragment,encoding='utf8')
print('Elevation review built:',folder/'elevations.html')
