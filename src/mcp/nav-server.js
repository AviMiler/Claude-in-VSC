// The code navigation MCP server (PLAN.md section 8): Streamable HTTP with JSON answers only,
// on 127.0.0.1 with a random port and a random Bearer token. Hand-written JSON-RPC.
const http = require('http');
const crypto = require('crypto');
const { NAV_SERVER_NAME } = require('./nav-config');

const NAV_SERVER_VERSION = '0.1.0';
const DEFAULT_PROTOCOL = '2025-03-26';

// tools: { list: [schemas], call(name, args) => Promise<{text}|{error}> }
function createRpcHandler(tools, log) {
  const names = new Set(tools.list.map((t) => t.name));
  return async function handleRpc(msg) {
    if (!msg || typeof msg !== 'object') return null;
    const { id, method, params } = msg;
    if (id === undefined || id === null) return null; // a notification
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    switch (method) {
      case 'initialize':
        return ok({
          protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: NAV_SERVER_NAME, version: NAV_SERVER_VERSION },
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: tools.list });
      case 'tools/call': {
        const name = params && params.name;
        if (!names.has(name)) return fail(-32602, `Unknown tool ${name}`);
        log(`tools/call ${name}`);
        try {
          const r = (await tools.call(name, (params && params.arguments) || {})) || {};
          if (r.error) return ok({ content: [{ type: 'text', text: String(r.error) }], isError: true });
          return ok({ content: [{ type: 'text', text: String(r.text == null ? '' : r.text) }] });
        } catch (err) {
          log(`tools/call ${name} failed: ${err && err.message}`);
          return fail(-32603, `Tool ${name} failed: ${err && err.message}`);
        }
      }
      default:
        return fail(-32601, `Method not found: ${method}`);
    }
  };
}

function startNavServer({ tools, log = () => {} }) {
  const token = crypto.randomBytes(24).toString('hex');
  const handleRpc = createRpcHandler(tools, log);
  const server = http.createServer((req, res) => {
    if ((req.headers.authorization || '') !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let msg;
      try { msg = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
      const messages = Array.isArray(msg) ? msg : [msg];
      const replies = (await Promise.all(messages.map(handleRpc))).filter(Boolean);
      if (!replies.length) { res.writeHead(202).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(msg) ? replies : replies[0]));
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}/mcp`;
      log(`nav server listening on ${url}`);
      resolve({ url, token, close: () => new Promise((done) => server.close(() => done())) });
    });
  });
}

module.exports = { startNavServer, createRpcHandler, NAV_SERVER_VERSION };
