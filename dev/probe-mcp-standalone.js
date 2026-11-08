// probe-mcp-standalone.js - ONE self-contained file (no npm, no repo). Node 18+ (22 recommended).
// Package H pre-check: does the real CLI show the tools of a small MCP server of ours to the model,
// does the model call them, and how many tokens does the tool list cost?
//
// Usage (PowerShell, from the folder that holds this file):
//   node probe-mcp-standalone.js --claude "C:\path\claude-bin.exe" --out mcp-report.json
// Options:
//   --transport http|stdio|both   (default both)
//   --model <id>                  pass --model to the CLI (default: the CLI's own setting)
//   --turn-timeout <sec>          wait per run (default 600; a cold model load took 285 s)
//
// What it does: starts a harmless MCP server on 127.0.0.1 (random port, random token) or as a stdio
// child, writes a temporary --mcp-config, runs `claude -p ...` twice (without and with the server)
// in a throw-away folder, and writes a JSON report. Nothing outside %TEMP% is touched.
// The tools: `ping` (returns a random word) and three stubs with the planned navigation schemas
// (documentSymbols, readSymbol, findReferences) that only return a fixed text.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ---------- the MCP server logic (shared by the HTTP and stdio modes) ----------
function argValue(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : def;
}

const NONCE = argValue('--nonce', crypto.randomBytes(4).toString('hex')); // the word `ping` returns
const TOOLS = [
  {
    name: 'ping',
    description: 'Connectivity test. Returns a short word. Call it with no arguments.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'documentSymbols',
    description: 'Outline of one file: symbol names, kinds and line ranges. Cheaper than reading the file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path of the file' },
        kind: { type: 'string', description: 'Optional filter: function, class, variable' },
      },
      required: ['file'],
    },
  },
  {
    name: 'readSymbol',
    description: 'Exact source of one function, component or class in a file, instead of the whole file.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path of the file' },
        symbol: { type: 'string', description: 'Name of the symbol' },
      },
      required: ['file', 'symbol'],
    },
  },
  {
    name: 'findReferences',
    description: 'Places that use a symbol, grouped by file with one source line each (at most 50).',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File that contains the symbol' },
        symbol: { type: 'string', description: 'Name of the symbol' },
      },
      required: ['file', 'symbol'],
    },
  },
];

const seen = []; // every JSON-RPC message the CLI sent: {method, name?, args?}

function handleRpc(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;
  const hasId = id !== undefined && id !== null;
  const entry = { method };
  if (method === 'tools/call') { entry.name = params && params.name; entry.args = params && params.arguments; }
  seen.push(entry);
  if (!hasId) return null; // a notification
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: (params && params.protocolVersion) || '2025-03-26',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'nav-probe', version: '0.0.1' },
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = params && params.name;
      if (name === 'ping') return ok({ content: [{ type: 'text', text: `PONG-${NONCE}` }] });
      if (TOOLS.some((t) => t.name === name)) {
        return ok({ content: [{ type: 'text', text: `stub answer of ${name}` }] });
      }
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool ${name}` } };
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ---------- stdio server mode (the CLI starts this same file with --serve-stdio) ----------
if (process.argv.includes('--serve-stdio')) {
  const logFile = argValue('--log', '');
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (_) { continue; }
      const reply = handleRpc(msg);
      if (logFile) fs.writeFileSync(logFile, JSON.stringify({ nonce: NONCE, seen }));
      if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
    }
  });
  process.stdin.on('end', () => process.exit(0));
  return;
}

// ---------- HTTP server (Streamable HTTP, JSON responses only) ----------
function startHttpServer(token) {
  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let msg;
      try { msg = JSON.parse(body); } catch (_) { res.writeHead(400).end(); return; }
      const messages = Array.isArray(msg) ? msg : [msg];
      const replies = messages.map(handleRpc).filter(Boolean);
      if (!replies.length) { res.writeHead(202).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(msg) ? replies : replies[0]));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------- running the CLI ----------
function quoteForCmd(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function runCli(claude, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const options = { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true };
    let child;
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(claude)) {
      const line = [claude, ...args].map(quoteForCmd).join(' ');
      child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { ...options, windowsVerbatimArguments: true });
    } else {
      child = spawn(claude, args, options);
    }
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => { clearTimeout(timer); resolve({ error: String(e), ms: Date.now() - started }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, stdout, stderr: stderr.slice(-1500), ms: Date.now() - started });
    });
  });
}

function parseResult(stdout) {
  try {
    const obj = JSON.parse(stdout.trim());
    const u = obj.usage || {};
    const inputTotal = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    return { text: typeof obj.result === 'string' ? obj.result : JSON.stringify(obj.result), isError: !!obj.is_error, usage: u, inputTotal, turns: obj.num_turns };
  } catch (_) {
    return { text: stdout.slice(0, 1500), parseFailed: true };
  }
}

const PROMPT_BASE = 'Reply with the single word OK.';
const PROMPT_TOOL =
  'First call the tool whose name ends with __ping, with no arguments. Then reply in one line: ' +
  'the exact word it returned, then a semicolon, then the names of all your tools whose name contains "nav-probe".';

async function main() {
  const claude = argValue('--claude', 'claude');
  const outFile = argValue('--out', 'mcp-report.json');
  const transportOpt = argValue('--transport', 'both');
  const model = argValue('--model', '');
  const timeoutMs = Number(argValue('--turn-timeout', '600')) * 1000;
  const transports = transportOpt === 'both' ? ['http', 'stdio'] : [transportOpt];

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-probe-mcp-'));
  const report = { startedAt: new Date().toISOString(), node: process.version, claude, nonce: NONCE, runs: [] };
  const save = () => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  const modelArgs = model ? ['--model', model] : [];

  console.log(`work folder: ${work}`);
  const version = await runCli(claude, ['--version'], { cwd: work, timeoutMs: 60000 });
  report.cliVersion = (version.stdout || version.error || '').trim();
  console.log(`CLI: ${report.cliVersion}`);
  save();

  // Run 0: baseline, no MCP server (strict config with no servers), for the token comparison.
  const emptyCfg = path.join(work, 'empty.json');
  fs.writeFileSync(emptyCfg, JSON.stringify({ mcpServers: {} }));
  console.log('run 0: baseline without the server (a cold model load can take minutes) ...');
  const base = await runCli(
    claude,
    ['-p', PROMPT_BASE, '--output-format', 'json', '--mcp-config', emptyCfg, '--strict-mcp-config', ...modelArgs],
    { cwd: work, timeoutMs },
  );
  report.baseline = { code: base.code, timedOut: base.timedOut, ms: base.ms, stderr: base.stderr, error: base.error, ...parseResult(base.stdout || '') };
  console.log(`  done: input tokens ${report.baseline.inputTotal}`);
  save();

  for (const transport of transports) {
    console.log(`run: transport ${transport} ...`);
    seen.length = 0;
    let server = null;
    const token = crypto.randomBytes(16).toString('hex');
    const cfgPath = path.join(work, `${transport}.json`);
    const stdioLog = path.join(work, 'stdio-log.json');
    if (transport === 'http') {
      server = await startHttpServer(token);
      const url = `http://127.0.0.1:${server.address().port}/mcp`;
      fs.writeFileSync(cfgPath, JSON.stringify({ mcpServers: { 'nav-probe': { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } } }));
    } else {
      fs.writeFileSync(cfgPath, JSON.stringify({ mcpServers: { 'nav-probe': { command: process.execPath, args: [__filename, '--serve-stdio', '--nonce', NONCE, '--log', stdioLog] } } }));
    }
    const r = await runCli(
      claude,
      ['-p', PROMPT_TOOL, '--output-format', 'json', '--mcp-config', cfgPath, '--strict-mcp-config', '--allowedTools', 'mcp__nav-probe', ...modelArgs],
      { cwd: work, timeoutMs },
    );
    if (server) await new Promise((res) => server.close(res));
    let serverSeen = seen.slice();
    if (transport === 'stdio') {
      try { serverSeen = JSON.parse(fs.readFileSync(stdioLog, 'utf8')).seen; } catch (_) { serverSeen = []; }
    }
    const parsed = parseResult(r.stdout || '');
    const methods = serverSeen.map((s) => s.method);
    const run = {
      transport,
      code: r.code, timedOut: r.timedOut, ms: r.ms, stderr: r.stderr, error: r.error,
      serverSawInitialize: methods.includes('initialize'),
      serverSawToolsList: methods.includes('tools/list'),
      serverSawPingCall: serverSeen.some((s) => s.method === 'tools/call' && s.name === 'ping'),
      modelAnswerHasNonce: (parsed.text || '').includes(NONCE),
      serverMessages: serverSeen,
      ...parsed,
      extraInputTokensVsBaseline: report.baseline.inputTotal !== undefined && parsed.inputTotal !== undefined
        ? parsed.inputTotal - report.baseline.inputTotal : null,
    };
    report.runs.push(run);
    console.log(`  tools shown to the CLI: list=${run.serverSawToolsList}, ping called=${run.serverSawPingCall}, model got the word=${run.modelAnswerHasNonce}`);
    save();
  }

  console.log(`\nreport: ${path.resolve(outFile)}`);
  console.log('clean-up: delete ' + work + ' and ~\\.claude\\projects\\*claude-probe-mcp*');
}

main().catch((e) => { console.error(e); process.exit(1); });
