// The IDE server (src/ide/): lock file lifecycle in a temp dir, handshake checks (token, Origin,
// subprotocol), MCP JSON-RPC over a real WebSocket made with our own codec, selection_changed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { OP, encodeFrame, createDecoder } = require('../src/ide/ws-frames');
const lock = require('../src/ide/ide-lock');
const { createIdeService } = require('../src/ide/ide-service');
const { tokenFromHeaders, originAllowed } = require('../src/ide/ws-server');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ide-lock-'));

// A minimal WebSocket client: resolves {status} on refusal, or {status:101, protocol, send, next, close}.
function connect(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...headers },
    });
    req.on('response', (res) => { res.resume(); resolve({ status: res.statusCode }); });
    req.on('error', reject);
    req.on('upgrade', (res, socket) => {
      const decoder = createDecoder({ requireMask: false });
      const queue = [];
      const waiting = [];
      socket.on('data', (chunk) => {
        for (const ev of decoder.push(chunk)) {
          const item = ev.kind === 'text' ? JSON.parse(ev.text) : ev;
          if (waiting.length) waiting.shift()(item);
          else queue.push(item);
        }
      });
      resolve({
        status: 101,
        protocol: res.headers['sec-websocket-protocol'],
        sendRaw: (buf) => socket.write(buf),
        send: (obj) => socket.write(encodeFrame(OP.TEXT, JSON.stringify(obj), { maskKey: crypto.randomBytes(4) })),
        next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiting.push(r))),
        close: () => socket.destroy(),
      });
    });
    req.end();
  });
}

test('lockContent has the fields the CLI parses', () => {
  const c = lock.lockContent({ pid: 7, workspaceFolders: ['c:\\p'], ideName: 'Visual Studio Code', authToken: 't', platform: 'win32' });
  assert.deepStrictEqual(c, { pid: 7, workspaceFolders: ['c:\\p'], ideName: 'Visual Studio Code', transport: 'ws', runningInWindows: true, authToken: 't' });
  assert.strictEqual(lock.lockContent({ pid: 1, platform: 'linux' }).runningInWindows, false);
});

test('lockDir respects CLAUDE_CONFIG_DIR', () => {
  assert.strictEqual(lock.lockDir({ CLAUDE_CONFIG_DIR: path.join('x', 'cfg') }), path.join('x', 'cfg', 'ide'));
});

test('writeLock creates the folder; removeLock deletes only a lock naming our pid', () => {
  const dir = path.join(tmpDir(), 'ide');
  const file = lock.writeLock(dir, 4321, { pid: process.pid });
  assert.strictEqual(path.basename(file), '4321.lock');
  assert.strictEqual(lock.removeLock(file, process.pid + 1), false);
  assert.ok(fs.existsSync(file));
  assert.strictEqual(lock.removeLock(file), true);
  assert.ok(!fs.existsSync(file));
  assert.strictEqual(lock.removeLock(file), false); // already gone: no throw
});

test('cleanStaleLocks deletes only locks with a dead pid AND a refusing port', async () => {
  const dir = tmpDir();
  const write = (port, data) => fs.writeFileSync(path.join(dir, `${port}.lock`), typeof data === 'string' ? data : JSON.stringify(data));
  write(1001, { pid: 11 }); // dead pid, refusing port -> deleted
  write(1002, { pid: 22 }); // live pid -> kept
  write(1003, { pid: 33 }); // dead pid, port answers -> kept
  write(1004, 'not json'); // unreadable -> left for the CLI
  fs.writeFileSync(path.join(dir, 'other.txt'), 'x'); // not a lock -> untouched
  const removed = await lock.cleanStaleLocks(dir, {
    isPidAlive: (pid) => pid === 22,
    isPortRefusing: async (port) => port !== 1003,
  });
  assert.deepStrictEqual(removed, ['1001.lock']);
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['1002.lock', '1003.lock', '1004.lock', 'other.txt']);
  assert.deepStrictEqual(await lock.cleanStaleLocks(path.join(dir, 'missing')), []);
});

test('pidAlive and portRefuses against real process and port', async () => {
  assert.strictEqual(lock.pidAlive(process.pid), true);
  assert.strictEqual(lock.pidAlive(0), false);
  const srv = http.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const { port } = srv.address();
  assert.strictEqual(await lock.portRefuses(port), false);
  await new Promise((r) => srv.close(r));
  assert.strictEqual(await lock.portRefuses(port), true);
});

test('tokenFromHeaders and originAllowed', () => {
  assert.strictEqual(tokenFromHeaders({ 'x-claude-code-ide-authorization': 'abc' }), 'abc');
  assert.strictEqual(tokenFromHeaders({ authorization: 'Bearer abc' }), 'abc');
  assert.strictEqual(tokenFromHeaders({}), '');
  assert.ok(originAllowed(undefined));
  assert.ok(originAllowed('http://localhost:3000'));
  assert.ok(originAllowed('http://127.0.0.1'));
  assert.ok(!originAllowed('https://evil.example'));
  assert.ok(!originAllowed('not a url'));
});

test('the service: lock, handshake checks, MCP over WebSocket, selection, stop', async () => {
  const dir = tmpDir();
  const folder = path.join(dir, 'proj');
  const logs = [];
  const opened = [];
  const svc = createIdeService({
    deps: {
      getDiagnostics: () => [{ uri: 'file:///a.js', diagnostics: [] }],
      getOpenEditors: () => ({ tabs: [] }),
      openFile: (args) => { opened.push(args); return `Opened ${args.filePath}`; },
    },
    workspaceFolders: () => [folder],
    ideName: 'Test IDE',
    dir,
    log: (t) => logs.push(t),
    verbose: true,
  });
  const port = await svc.start();
  const lockFile = path.join(dir, `${port}.lock`);
  const content = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  assert.strictEqual(content.pid, process.pid);
  assert.strictEqual(content.authToken, svc.token);
  assert.deepStrictEqual(content.workspaceFolders, [folder]);
  assert.strictEqual(content.transport, 'ws');

  assert.deepStrictEqual(svc.envFor(folder.toUpperCase()), { CLAUDE_CODE_SSE_PORT: String(port) });
  assert.deepStrictEqual(svc.envFor(path.join(dir, 'elsewhere')), {});

  assert.strictEqual((await connect(port)).status, 401);
  assert.strictEqual((await connect(port, { 'x-claude-code-ide-authorization': 'wrong' })).status, 401);
  assert.strictEqual((await connect(port, { 'x-claude-code-ide-authorization': svc.token, Origin: 'https://evil.example' })).status, 403);

  let missing = 0;
  const cancel = svc.watchConnection(() => { missing += 1; }, 50);
  const c = await connect(port, { 'x-claude-code-ide-authorization': svc.token, 'Sec-WebSocket-Protocol': 'mcp' });
  assert.strictEqual(c.status, 101);
  assert.strictEqual(c.protocol, 'mcp');
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(missing, 0, 'a connection cancels the "not connected" notice');
  cancel();

  c.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  const init = await c.next();
  assert.strictEqual(init.result.protocolVersion, '2025-06-18');
  c.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepStrictEqual((await c.next()).result.tools.map((t) => t.name), ['getDiagnostics', 'getOpenEditors', 'openFile']);
  c.send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'openFile', arguments: { filePath: 'a.js' } } });
  assert.deepStrictEqual((await c.next()).result.content, [{ type: 'text', text: 'Opened a.js' }]);
  assert.deepStrictEqual(opened, [{ filePath: 'a.js' }]);
  c.send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'getDiagnostics', arguments: {} } });
  assert.deepStrictEqual(JSON.parse((await c.next()).result.content[0].text), [{ uri: 'file:///a.js', diagnostics: [] }]);
  c.send({ jsonrpc: '2.0', id: 5, method: 'nope' });
  assert.strictEqual((await c.next()).error.code, -32601);

  // A message split into fragments over the wire.
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'ping' }));
  c.sendRaw(encodeFrame(OP.TEXT, body.subarray(0, 5), { fin: false, maskKey: crypto.randomBytes(4) }));
  c.sendRaw(encodeFrame(OP.CONT, body.subarray(5), { maskKey: crypto.randomBytes(4) }));
  assert.deepStrictEqual(await c.next(), { jsonrpc: '2.0', id: 6, result: {} });

  svc.notifySelection({ filePath: 'C:\\p\\a.js', fileUrl: 'file:///c%3A/p/a.js', text: 'x', start: { line: 1, character: 0 }, end: { line: 1, character: 1 } });
  const sel = await c.next();
  assert.strictEqual(sel.method, 'selection_changed');
  assert.deepStrictEqual(sel.params.selection, { start: { line: 1, character: 0 }, end: { line: 1, character: 1 }, isEmpty: false });

  assert.ok(logs.some((l) => l.startsWith('handshake GET')), 'verbose handshake logged');
  assert.ok(logs.some((l) => l.startsWith('<< ') && l.includes('"initialize"')), 'verbose messages logged');
  assert.ok(!logs.some((l) => l.includes(svc.token)), 'token never in the log');

  await svc.stop();
  c.close();
  assert.ok(!fs.existsSync(lockFile), 'lock removed on stop');
});

test('watchConnection calls onMissing when no client connects', async () => {
  const svc = createIdeService({ deps: {}, workspaceFolders: () => [], ideName: 'T', dir: tmpDir() });
  await svc.start();
  let missing = 0;
  svc.watchConnection(() => { missing += 1; }, 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(missing, 1);
  await svc.stop();
});
