// The navigation MCP server: auth, HTTP method, JSON-RPC routing (fake tools, real HTTP).
const test = require('node:test');
const assert = require('node:assert');
const { startNavServer, NAV_SERVER_VERSION } = require('../src/mcp/nav-server');
const { buildMcpConfig, NAV_SERVER_NAME, NAV_ALLOWED_TOOL } = require('../src/mcp/nav-config');

const SCHEMAS = [
  { name: 'documentSymbols', description: 'Outline', inputSchema: { type: 'object', properties: { file: { type: 'string' } } } },
];
const calls = [];
const tools = {
  list: SCHEMAS,
  async call(name, args) {
    calls.push({ name, args });
    return args.file === 'bad' ? { error: 'no access' } : { text: `outline of ${args.file}` };
  },
};

let srv;
test.before(async () => { srv = await startNavServer({ tools }); });
test.after(() => srv.close());

function post(body, { auth = true, method = 'POST' } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${srv.token}`;
  return fetch(srv.url, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined });
}

async function rpc(method, params) {
  const res = await post({ jsonrpc: '2.0', id: 1, method, params });
  assert.strictEqual(res.status, 200);
  return res.json();
}

test('listens on 127.0.0.1 with a long random token', () => {
  assert.match(srv.url, /^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  assert.ok(srv.token.length >= 32);
});

test('401 without the token or with a wrong one', async () => {
  assert.strictEqual((await post({}, { auth: false })).status, 401);
  const res = await fetch(srv.url, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' });
  assert.strictEqual(res.status, 401);
});

test('405 on GET', async () => {
  assert.strictEqual((await post(null, { method: 'GET' })).status, 405);
});

test('400 on a body that is not JSON', async () => {
  const res = await fetch(srv.url, { method: 'POST', headers: { Authorization: `Bearer ${srv.token}` }, body: '{' });
  assert.strictEqual(res.status, 400);
});

test('initialize returns server info and echoes the protocol version', async () => {
  const r = await rpc('initialize', { protocolVersion: '2025-06-18' });
  assert.deepStrictEqual(r.result.serverInfo, { name: 'claude-local-nav', version: NAV_SERVER_VERSION });
  assert.strictEqual(r.result.protocolVersion, '2025-06-18');
  assert.ok(r.result.capabilities.tools);
});

test('notifications get 202 with no body', async () => {
  const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.strictEqual(res.status, 202);
  assert.strictEqual(await res.text(), '');
});

test('ping returns an empty result', async () => {
  assert.deepStrictEqual((await rpc('ping')).result, {});
});

test('tools/list returns the schemas', async () => {
  assert.deepStrictEqual((await rpc('tools/list')).result.tools, SCHEMAS);
});

test('tools/call routes to tools.call and wraps the text', async () => {
  calls.length = 0;
  const r = await rpc('tools/call', { name: 'documentSymbols', arguments: { file: 'a.js' } });
  assert.deepStrictEqual(calls, [{ name: 'documentSymbols', args: { file: 'a.js' } }]);
  assert.deepStrictEqual(r.result, { content: [{ type: 'text', text: 'outline of a.js' }] });
});

test('a tool error becomes an isError result', async () => {
  const r = await rpc('tools/call', { name: 'documentSymbols', arguments: { file: 'bad' } });
  assert.deepStrictEqual(r.result, { content: [{ type: 'text', text: 'no access' }], isError: true });
});

test('unknown tool and unknown method are JSON-RPC errors', async () => {
  const r = await rpc('tools/call', { name: 'nope', arguments: {} });
  assert.strictEqual(r.error.code, -32602);
  assert.strictEqual((await rpc('resources/list')).error.code, -32601);
});

test('the inline config names our server with the Bearer header', () => {
  const cfg = JSON.parse(buildMcpConfig({ url: 'http://127.0.0.1:1/mcp', token: 't' }));
  assert.deepStrictEqual(cfg.mcpServers[NAV_SERVER_NAME], {
    type: 'http', url: 'http://127.0.0.1:1/mcp', headers: { Authorization: 'Bearer t' },
  });
  assert.strictEqual(NAV_ALLOWED_TOOL, 'mcp__claude-local-nav');
});
