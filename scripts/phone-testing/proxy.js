const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { forwardHeaders } = require('./proxyHeaders');
const MODE_FILE = path.join(__dirname, 'mode.txt');
const LOG_FILE = path.join(__dirname, 'proxy.log');
const readMode = () => { try { return fs.readFileSync(MODE_FILE, 'utf8').trim(); } catch { return ''; } };
const log = (m) => fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + m + '\n');
// mode.txt formats (one line):  ""                       normal
//   cutreq:<substr>            destroy the connection after ~8KB of the request body (never forwarded)
//   dropresp:<substr>          forward fully, then drop the response (server DID process it)
//   slow:<ms>:<substr>         delay forwarding by <ms> (to force-close the app mid-request)
//   <substr> matches the request URL of POST/PUT/PATCH/DELETE requests.

http.createServer((req, res) => {
  const write = req.method !== 'GET' && req.method !== 'HEAD';
  const raw = write ? readMode() : '';
  const parts = raw.split(':');
  const kind = parts[0] || '';
  const needle = (kind === 'slow' || kind === 'status') ? parts.slice(2).join(':') : parts.slice(1).join(':');
  const hit = write && kind && req.url.includes(needle);
  const headers = forwardHeaders(req.headers);
  const tag = `${req.method} ${req.url.split('?')[0]}`;

  const forward = () => {
    const up = https.request(
      { host: '127.0.0.1', port: 443, path: req.url, method: req.method, headers, servername: 'localhost', rejectUnauthorized: false },
      (r) => {
        if (hit && kind === 'dropresp') {
          r.resume();
          r.on('end', () => { log(`${tag}: server answered ${r.statusCode}, response DROPPED`); req.socket.destroy(); });
          return;
        }
        if (write) log(`${tag}: ${r.statusCode}${hit ? ' (' + kind + ')' : ''}`);
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      }
    );
    up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
    return up;
  };

  if (hit && kind === 'status') {
    // status:<code>:<substr> -> answer locally with that status; the request never reaches the server.
    const code = Number(parts[1]);
    const sub = parts.slice(2).join(':');
    if (req.url.includes(sub)) {
      req.resume();
      req.on('end', () => { log(`${tag}: FAKE ${code} (never forwarded)`); res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(code === 409 ? { error: 'LOCATION_PROPOSAL_ALREADY_PENDING', message: 'A location proposal for this location is already awaiting review.' } : { error: code === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' })); });
      return;
    }
  }
  if (hit && kind === 'cutreq') {
    let got = 0;
    req.on('data', (c) => { got += c.length; if (got > 8000) { log(`${tag}: cutreq destroyed after ${got} bytes (never forwarded)`); req.socket.destroy(); } });
    return;
  }
  if (hit && kind === 'slow') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      log(`${tag}: holding ${parts[1]}ms`);
      setTimeout(() => { const up = forward(); up.end(Buffer.concat(chunks)); }, Number(parts[1]));
    });
    return;
  }
  req.pipe(forward());
}).listen(8081, '127.0.0.1', () => console.log('proxy on 8081'));
