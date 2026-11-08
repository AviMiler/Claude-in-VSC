// The IDE server's WebSocket transport (PLAN.md section 7): 127.0.0.1 only, random port, a random
// token required on the handshake, non-localhost Origin refused. No vscode, no npm.
// The token header the CLI really sends is NOT verified (CLI 2.1.246); TOKEN_HEADERS lists the
// accepted places and the handshake is logged (token masked) so a real run shows the truth.
const http = require('http');
const crypto = require('crypto');
const { OP, WsError, acceptKey, encodeFrame, closePayload, createDecoder } = require('./ws-frames');

// Public-knowledge guess first; `authorization` (raw or "Bearer x") as a fallback. Adjust here.
const TOKEN_HEADERS = ['x-claude-code-ide-authorization', 'authorization'];
const SUBPROTOCOL = 'mcp'; // echoed only when the client offers it
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const mask = (text, token) => (token ? String(text).split(token).join('***') : String(text));

// The token the client sent in one of TOKEN_HEADERS, or ''.
function tokenFromHeaders(headers) {
  for (const name of TOKEN_HEADERS) {
    const v = headers[name];
    if (typeof v === 'string' && v) return v.replace(/^Bearer\s+/i, '').trim();
  }
  return '';
}

function sameSecret(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// No Origin (a non-browser client like the CLI) is fine; a browser page's Origin must be local.
function originAllowed(origin) {
  if (!origin) return true;
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

// Why the handshake is refused (status + reason), or null when it is accepted.
function checkHandshake(req, token) {
  const h = req.headers;
  if (String(h.upgrade || '').toLowerCase() !== 'websocket' || !h['sec-websocket-key']) return { status: 400, reason: 'not a WebSocket upgrade' };
  if (String(h['sec-websocket-version'] || '') !== '13') return { status: 426, reason: `unsupported version ${h['sec-websocket-version']}` };
  if (!originAllowed(h.origin)) return { status: 403, reason: `origin ${h.origin} is not local` };
  const sent = tokenFromHeaders(h);
  if (!sent) return { status: 401, reason: 'no token' };
  if (!sameSecret(sent, token)) return { status: 401, reason: 'wrong token' };
  return null;
}

function describeHandshake(req, token, verbose) {
  if (!verbose) return `${req.method} ${req.url} headers=[${Object.keys(req.headers).join(',')}]`;
  const lines = Object.entries(req.headers).map(([k, v]) => `${k}: ${mask(v, token)}`);
  return `${req.method} ${req.url} | ${lines.join(' | ')}`;
}

// One accepted connection: send(text), close(code, reason); `onText(text)` and `onClose()` set by the caller.
function wrapSocket(socket, log) {
  const decoder = createDecoder();
  let closed = false;
  const conn = {
    onText: () => {},
    onClose: () => {},
    send(text) {
      if (!closed) socket.write(encodeFrame(OP.TEXT, Buffer.from(String(text), 'utf8')));
    },
    close(code = 1000, reason = '') {
      if (closed) return;
      closed = true;
      socket.end(encodeFrame(OP.CLOSE, closePayload(code, reason)));
    },
  };
  socket.setNoDelay(true);
  socket.on('data', (chunk) => {
    let events;
    try {
      events = decoder.push(chunk);
    } catch (err) {
      log(`protocol error ${err.code || ''}: ${err.message}`, 'warn');
      conn.close(err instanceof WsError ? err.code : 1002, 'protocol error');
      return;
    }
    for (const ev of events) {
      if (ev.kind === 'text') conn.onText(ev.text);
      else if (ev.kind === 'ping') socket.write(encodeFrame(OP.PONG, ev.data));
      else if (ev.kind === 'close') {
        log(`client closed (${ev.code}${ev.reason ? ` ${ev.reason}` : ''})`);
        conn.close(ev.code === 1005 ? 1000 : ev.code);
      } else if (ev.kind === 'binary') log(`ignored a binary message (${ev.data.length} bytes)`, 'warn');
    }
  });
  socket.on('close', () => {
    closed = true;
    conn.onClose();
  });
  socket.on('error', (err) => log(`socket error: ${err.message}`, 'warn'));
  return conn;
}

// Starts the server. `onConnection(conn, req)` per accepted client. `log(text, level)`.
// Resolves {port, close()}.
function startWsServer({ token, onConnection, log = () => {}, verbose = false, host = '127.0.0.1' }) {
  const server = http.createServer((req, res) => res.writeHead(426, { 'Content-Type': 'text/plain' }).end('WebSocket only'));
  const sockets = new Set();
  server.on('upgrade', (req, socket) => {
    log(`handshake ${describeHandshake(req, token, typeof verbose === 'function' ? verbose() : verbose)}`);
    const refused = checkHandshake(req, token);
    if (refused) {
      log(`rejected: ${refused.reason}`, 'warn');
      socket.end(`HTTP/1.1 ${refused.status} ${http.STATUS_CODES[refused.status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    const offered = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    const lines = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(req.headers['sec-websocket-key'])}`,
    ];
    if (offered.includes(SUBPROTOCOL)) lines.push(`Sec-WebSocket-Protocol: ${SUBPROTOCOL}`);
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    log(`accepted (subprotocols offered: [${offered.join(',')}])`);
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    onConnection(wrapSocket(socket, log), req);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((done) => {
          for (const s of sockets) s.destroy();
          server.close(() => done());
        }),
      });
    });
  });
}

module.exports = { startWsServer, tokenFromHeaders, originAllowed, checkHandshake, mask, TOKEN_HEADERS, SUBPROTOCOL };
