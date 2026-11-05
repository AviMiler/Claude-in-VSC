// One CLI conversation process: newline-delimited JSON over stdio plus the control protocol.
// Emits 'message' for every stream line that is not a control frame, 'controlRequest' for
// requests the CLI sends us (can_use_tool), 'stderr', and 'exit'.
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const { spawnCli } = require('./spawn');

const { startNavServer } = require('../mcp/nav-server');
const { buildMcpConfig, NAV_ALLOWED_TOOL } = require('../mcp/nav-config');

const KILL_GRACE_MS = 6000;

// The navigation tools come from src/mcp/nav-tools.js (needs vscode); without them, no server.
function loadNavTools(log) {
  let tools;
  try {
    // nav-vscode.js is the only file that requires 'vscode'; outside VS Code (tests) this throws and no server starts.
    const { createNavTools } = require('../mcp/nav-tools');
    const { createVscodeNavDeps } = require('../mcp/nav-vscode');
    tools = createNavTools(createVscodeNavDeps());
  } catch (err) {
    log(`nav tools not loaded: ${err && err.message}`, 'nav', 'info');
    return null;
  }
  const usable = tools && Array.isArray(tools.list) && tools.list.length > 0 && typeof tools.call === 'function';
  return usable ? tools : null;
}

// Type and size only: stream lines carry message text, which must not reach the log.
function describe(msg, length) {
  const sub = (msg.request && msg.request.subtype) || (msg.response && msg.response.subtype) || msg.subtype;
  return `${msg.type}${sub ? `/${sub}` : ''} (${length} chars)`;
}

class CliProcess extends EventEmitter {
  // navTools: { list, call } for the navigation MCP server; null starts the CLI without it.
  constructor({ claudePath, args, cwd, env, log = () => {}, navTools = loadNavTools(log) }) {
    super();
    this.log = log;
    this.pending = new Map();
    this.nextId = 1;
    this.stderrTail = '';
    this.exited = false;
    this.child = null;
    this.queue = []; // lines sent before the child exists (while the nav server starts)
    this.nav = null;
    const spawnWith = (extra) => this.spawnChild(claudePath, args.concat(extra), { cwd, env });
    if (!navTools) {
      spawnWith([]);
      return;
    }
    startNavServer({ tools: navTools, log: (t) => log(t, 'nav') }).then(
      (srv) => {
        if (this.exited) { srv.close(); return; }
        this.nav = srv;
        spawnWith(['--mcp-config', buildMcpConfig(srv), '--allowedTools', NAV_ALLOWED_TOOL]);
      },
      (err) => {
        log(`nav server failed to start: ${err && err.message}`, 'nav', 'warn');
        if (!this.exited) spawnWith([]);
      },
    );
  }

  spawnChild(claudePath, args, opts) {
    this.child = spawnCli(claudePath, args, opts);
    this.child.on('error', (err) => this.finish({ code: null, error: err }));
    this.child.on('exit', (code, signal) => this.finish({ code, signal }));
    this.child.stdin.on('error', () => {});
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (d) => {
      this.stderrTail = (this.stderrTail + d).slice(-3000);
      this.emit('stderr', d);
    });
    this.readLines(this.child.stdout, (line) => this.onLine(line));
    for (const line of this.queue.splice(0)) this.child.stdin.write(line + '\n');
  }

  readLines(stream, onLine) {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    });
  }

  onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log(`ignored non-JSON line (${line.length} chars)`);
      return;
    }
    this.log(`<< ${describe(msg, line.length)}`);
    if (msg.type === 'control_response') {
      const { request_id: id, subtype, response, error } = msg.response || {};
      this.log(`response ${id} ${subtype}${error ? `: ${error}` : ''}`, 'control', error ? 'warn' : 'info');
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      clearTimeout(entry.timer);
      if (subtype === 'success') entry.resolve(response || {});
      else entry.reject(new Error(error || 'control request failed'));
      return;
    }
    if (msg.type === 'control_request') {
      this.emit('controlRequest', msg.request_id, msg.request || {});
      return;
    }
    if (msg.type === 'control_cancel_request') {
      this.emit('controlCancel', msg.request_id);
      return;
    }
    this.emit('message', msg);
  }

  send(obj) {
    if (this.exited) return false;
    const line = JSON.stringify(obj);
    this.log(`>> ${describe(obj, line.length)}`);
    if (!this.child) this.queue.push(line);
    else this.child.stdin.write(line + '\n');
    return true;
  }

  sendUserText(text, images = []) {
    const content = images.map((i) => ({ type: 'image', source: { type: 'base64', media_type: i.mediaType, data: i.data } }));
    content.push({ type: 'text', text });
    return this.send({ type: 'user', message: { role: 'user', content } });
  }

  request(subtype, payload = {}, timeoutMs = 60000) {
    const requestId = `ext-${this.nextId++}`;
    return new Promise((resolve, reject) => {
      if (this.exited) return reject(new Error('process exited'));
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${subtype} timed out`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.log(`request ${requestId} ${subtype}`, 'control', 'info');
      this.send({ type: 'control_request', request_id: requestId, request: { subtype, ...payload } });
    });
  }

  respond(requestId, response) {
    this.send({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } });
  }

  respondError(requestId, error) {
    this.send({ type: 'control_response', response: { subtype: 'error', request_id: requestId, error } });
  }

  interrupt() {
    return this.request('interrupt', {}, 10000);
  }

  kill() {
    if (this.exited) return;
    if (!this.child) { this.finish({ code: null, signal: 'SIGTERM' }); return; }
    const pid = this.child.pid;
    try { this.child.stdin.end(); } catch {}
    if (process.platform === 'win32' && pid) {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }).on('error', () => {});
    } else {
      this.child.kill('SIGTERM');
    }
  }

  // Interrupt first; if the process is still alive after the grace period, kill it.
  stop() {
    const timer = setTimeout(() => this.kill(), KILL_GRACE_MS);
    this.once('exit', () => clearTimeout(timer));
    return this.interrupt().then(() => clearTimeout(timer), () => {});
  }

  finish(info) {
    if (this.exited) return;
    this.exited = true;
    if (this.nav) { this.nav.close(); this.nav = null; }
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('process exited'));
    }
    this.pending.clear();
    this.emit('exit', { ...info, stderrTail: this.stderrTail });
  }
}

module.exports = { CliProcess };
