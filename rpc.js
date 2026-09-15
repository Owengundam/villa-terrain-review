const http = require('http');
const fs = require('fs');
const [,, method, arg] = process.argv;
let params = {};
if (arg) {
  if (arg.startsWith('@')) {
    const p = arg.slice(1);
    if (method === 'run_python' && p.toLowerCase().endsWith('.py')) {
      params = { script: fs.readFileSync(p, 'utf8') };
    } else {
      params = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } else {
    params = JSON.parse(arg);
  }
}
// route everything through MCP tools/call
let rpcMethod = method, rpcParams = params;
if (method !== 'tools/list' && method !== 'ping') {
  rpcMethod = 'tools/call';
  rpcParams = { name: method, arguments: params };
} else if (method === 'ping') {
  rpcMethod = 'ping'; rpcParams = {};
}
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: rpcMethod, params: rpcParams });
const req = http.request({ host: '127.0.0.1', port: 2000, path: '/', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      if (j.error) { console.error('RPC ERROR:', JSON.stringify(j.error)); process.exit(2); }
      let out = j.result;
      if (out && Array.isArray(out.content)) {
        out = out.content.map(c => (c && c.text !== undefined) ? c.text : JSON.stringify(c)).join('\n');
        // unwrap run_python JSON payload
        try { const inner = JSON.parse(out); if (inner && (inner.stdout !== undefined || inner.error !== undefined)) out = inner.error ? ('PY ERROR: ' + inner.error) : (inner.stdout ?? ''); } catch (e) {}
      }
      console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
    } catch (e) { console.log(data); }
  });
});
req.on('error', e => { console.error('CONN ERROR:', e.message); process.exit(1); });
req.setTimeout(300000, () => { console.error('TIMEOUT'); req.destroy(); });
req.end(body);
