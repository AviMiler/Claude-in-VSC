// probe3-standalone.js - ONE self-contained file (no other files, no npm needed). Node 18+ (22 recommended).
// Usage: node probe3-standalone.js --claude "C:\\path\\claude-bin.exe" --out probe3-report.json [--only s1,s3] [--alt-model gemma3:27b] [--turn-timeout 240]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// ---------- part 1: how to start the CLI (from src/cli/spawn.js) ----------
// Starts the CLI executable. On Windows a bare name is resolved on PATH x PATHEXT,
// and .cmd/.bat files go through cmd.exe because Node cannot spawn them directly.

const ENTRYPOINT = 'claude-local-vscode';

function resolveExecutable(command, env = process.env, platform = process.platform) {
  if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) return command;
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = platform === 'win32'
    ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of platform === 'win32' && path.extname(command) ? [''] : exts) {
      const candidate = path.join(dir, command + ext.toLowerCase());
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return command;
}

function quoteForCmd(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function spawnCli(claudePath, args, { cwd, env = process.env } = {}) {
  const exe = resolveExecutable(claudePath, env);
  const childEnv = { ...env, CLAUDE_CODE_ENTRYPOINT: ENTRYPOINT };
  const options = { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true };
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe)) {
    const line = [exe, ...args].map(quoteForCmd).join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      ...options,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(exe, args, options);
}

// ---------- part 2: CLI arguments (from src/cli/args.js) ----------
// The CLI argument list for one long-lived stream-json conversation process.

const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

// allowBypass: the CLI only accepts a later switch to bypassPermissions when the process was
// started with --allow-dangerously-skip-permissions (checked against CLI 2.1.181).
function buildArgs({ permissionMode = 'default', resume, model, allowBypass = false } = {}) {
  const mode = PERMISSION_MODES.includes(permissionMode) ? permissionMode : 'default';
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool', 'stdio',
    '--permission-mode', mode,
  ];
  if (allowBypass) args.push('--allow-dangerously-skip-permissions');
  if (resume) args.push('--resume', resume);
  if (model) args.push('--model', model);
  return args;
}

// ---------- part 3: the stream-json process wrapper (from src/cli/process.js) ----------
// One CLI conversation process: newline-delimited JSON over stdio plus the control protocol.
// Emits 'message' for every stream line that is not a control frame, 'controlRequest' for
// requests the CLI sends us (can_use_tool), 'stderr', and 'exit'.

const KILL_GRACE_MS = 6000;

class CliProcess extends EventEmitter {
  constructor({ claudePath, args, cwd, env, log = () => {} }) {
    super();
    this.log = log;
    this.pending = new Map();
    this.nextId = 1;
    this.stderrTail = '';
    this.exited = false;
    this.child = spawnCli(claudePath, args, { cwd, env });
    this.child.on('error', (err) => this.finish({ code: null, error: err }));
    this.child.on('exit', (code, signal) => this.finish({ code, signal }));
    this.child.stdin.on('error', () => {});
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (d) => {
      this.stderrTail = (this.stderrTail + d).slice(-3000);
      this.emit('stderr', d);
    });
    this.readLines(this.child.stdout, (line) => this.onLine(line));
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
    this.log(`<< ${line}`);
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log(`ignored non-JSON line`);
      return;
    }
    if (msg.type === 'control_response') {
      const { request_id: id, subtype, response, error } = msg.response || {};
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
    this.log(`>> ${line}`);
    this.child.stdin.write(line + '\n');
    return true;
  }

  sendUserText(text) {
    return this.send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
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
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(new Error('process exited'));
    }
    this.pending.clear();
    this.emit('exit', { ...info, stderrTail: this.stderrTail });
  }
}

// ---------- part 4: the second round of probes ----------
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const claudePath = opt('claude', 'claude');
const outFile = path.resolve(opt('out', 'probe3-report.json'));
const only = opt('only', '') ? opt('only').split(',') : null;
const turnTimeoutMs = Number(opt('turn-timeout', '240')) * 1000;
const altModel = opt('alt-model', 'gemma3:27b');
const quick = argv.includes('--quick'); // only for testing the script itself

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-probe3-'));
const report = { claudePath, sandbox, startedAt: new Date().toISOString(), probes: {} };
const save = () => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, quick ? Math.min(ms, 300) : ms));
const clip = (v, n = 400) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '...' : s;
};
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PsQkAAAzDsPz/dHpCp2wCzwalybTxvgEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+Dq47PDiz8p6GQAAAABJRU5ErkJggg==';

// Safety filters for auto-answered permission requests (same rules as the first probe).
const isSafeBash = (cmd) => {
  const c = String(cmd || '').trim().replace(/^!/, '');
  return c.length > 0 && c.length < 120 && /^(ping|sleep|echo|timeout)(\s|$)/i.test(c) && !/[&|;<>`$()\r\n]/.test(c);
};
const isProbeFile = (p) => {
  try {
    const full = path.resolve(sandbox, String(p || ''));
    return path.basename(full) === 'a.txt'
      && fs.realpathSync.native(path.dirname(full)) === fs.realpathSync.native(sandbox);
  } catch { return false; }
};
const answers = { mode: 'allow' }; // switched by probes: 'allow' | 'deny'

// One CLI process. Tool permission requests are recorded and answered by `onPermission`.
function start({ mode = 'default', onPermission, env = {}, extraArgs = [], resume, fork } = {}) {
  const seen = [];
  const permissions = [];
  const args = buildArgs({ permissionMode: mode, resume }).concat(fork ? ['--fork-session'] : [], extraArgs);
  const proc = new CliProcess({ claudePath, args, cwd: sandbox, env: { ...process.env, ...env } });
  proc.on('message', (m) => seen.push(m));
  proc.on('controlRequest', (id, req) => {
    if (req.subtype === 'can_use_tool') {
      permissions.push({ tool: req.tool_name, input: req.input, request: req });
      const ans = onPermission ? onPermission(req) : { behavior: 'deny', message: 'probe: denied' };
      proc.respond(id, ans);
    } else {
      proc.respondError(id, 'unsupported in probe');
    }
  });
  return { proc, seen, permissions };
}

// Sends one user message (text or content blocks) and waits for the next `result`.
function turn(h, content, timeoutMs = turnTimeoutMs) {
  const from = h.seen.length;
  const sentAt = Date.now();
  const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  h.proc.send({ type: 'user', message: { role: 'user', content: blocks } });
  return new Promise((resolve) => {
    const tick = setInterval(() => {
      const slice = h.seen.slice(from);
      const result = slice.find((m) => m.type === 'result');
      if (result || Date.now() - sentAt > (quick ? 6000 : timeoutMs) || h.proc.exited) {
        clearInterval(tick);
        resolve({ timedOut: !result, exited: h.proc.exited, result, messages: slice });
      }
    }, 250);
  });
}

const summarize = (messages) => {
  const types = {};
  const blockTypes = {};
  const tools = [];
  for (const m of messages) {
    const key = m.type + (m.subtype ? '/' + m.subtype : '') + (m.type === 'stream_event' ? '/' + (m.event && m.event.type) : '');
    types[key] = (types[key] || 0) + 1;
    if (m.type === 'stream_event' && m.event && m.event.type === 'content_block_start' && m.event.content_block) {
      const bt = m.event.content_block.type;
      blockTypes[bt] = (blockTypes[bt] || 0) + 1;
    }
    if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) if (b.type === 'tool_use') tools.push(b.name);
    }
  }
  return { eventTypes: types, contentBlockTypes: blockTypes, toolsUsed: tools };
};
const resultText = (t) => clip((t.result && t.result.result) || '', 300);
const init = (h) => h.proc.request('initialize', {}, 90000);
const sessionIdOf = (h) => {
  const m = h.seen.find((x) => x.type === 'system' && x.subtype === 'init');
  return m && m.session_id;
};
const tryReq = async (h, subtype, payload, ms = 30000) => {
  try { return { ok: true, response: await h.proc.request(subtype, payload, ms) }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
};
const editHandler = (changeText) => (req) => {
  if (req.tool_name === 'Edit' && isProbeFile(req.input && req.input.file_path)) {
    const input = { ...req.input };
    if (changeText && 'new_string' in input) input.new_string = changeText;
    return { behavior: 'allow', updatedInput: input };
  }
  return { behavior: 'deny', message: 'probe: denied' };
};
const makeA = () => {
  const file = path.join(sandbox, 'a.txt');
  fs.writeFileSync(file, 'one\ntwo\nthree\n');
  return file;
};
const READ_EDIT = 'First use the Read tool on a.txt in the current folder. Then use the Edit tool to replace the text "two" with "TWO". Use no other tool.';

// Allowed only on files inside the throw-away folder.
const inSandbox = (p, names) => {
  try {
    const full = path.resolve(sandbox, String(p || ''));
    return names.includes(path.basename(full))
      && fs.realpathSync.native(path.dirname(full)) === fs.realpathSync.native(sandbox);
  } catch { return false; }
};
// Read/Edit of a.txt are allowed (Edit may carry a changed new_string); everything else is denied.
const fileHandler = (changeText) => (req) => {
  const p = req.input && req.input.file_path;
  if ((req.tool_name === 'Read' || req.tool_name === 'Edit') && inSandbox(p, ['a.txt'])) {
    const input = { ...req.input };
    if (req.tool_name === 'Edit' && changeText && 'new_string' in input) input.new_string = changeText;
    return { behavior: 'allow', updatedInput: input };
  }
  return { behavior: 'deny', message: 'probe: denied' };
};
const reqShape = (p) => ({ tool: p.tool, requestKeys: Object.keys(p.request), suggestions: clip(p.request.permission_suggestions, 800), reasonType: p.request.decision_reason_type, input: clip(p.input, 300) });
const modelsUsed = (t) => (t.result && t.result.modelUsage) ? Object.keys(t.result.modelUsage) : null;

async function rewindTest(env) {
  const file = makeA();
  const h = start({ env, extraArgs: ['--replay-user-messages'], onPermission: fileHandler() });
  try {
    await init(h);
    const t = await turn(h, READ_EDIT);
    const afterEdit = fs.readFileSync(file, 'utf8');
    const out = { timedOut: t.timedOut, permissions: h.permissions.map((p) => ({ tool: p.tool })), afterEdit, editApplied: afterEdit.includes('TWO'), resultText: resultText(t), ...summarize(t.messages) };
    const userMsgs = h.seen.filter((m) => m.type === 'user' && m.uuid
      && !(m.message && Array.isArray(m.message.content) && m.message.content.some((b) => b.type === 'tool_result')));
    out.userMessageUuids = userMsgs.slice(0, 2).map((m) => m.uuid);
    out.rewind = {};
    if (userMsgs.length) {
      const id = userMsgs[0].uuid;
      out.rewind.dryRun = await tryReq(h, 'rewind_files', { user_message_id: id, dry_run: true });
      out.rewind.real = await tryReq(h, 'rewind_files', { user_message_id: id });
      out.afterRewind = fs.readFileSync(file, 'utf8');
      out.fileRestored = out.afterRewind.includes('two') && !out.afterRewind.includes('TWO');
    }
    out.rewindProven = out.editApplied && out.fileRestored === true;
    return out;
  } finally { h.proc.kill(); }
}

const probes = {
  // Rewind with the SDK env var switched on, and without it (to see if the saved
  // "checkpoints" setting alone is enough).
  async s1a_rewind_with_env() { return rewindTest({ CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1' }); },
  async s1b_rewind_without_env() { return rewindTest({}); },

  // Does the CLI use the changed input we return for an Edit permission request?
  async s2_updated_input() {
    const file = makeA();
    const h = start({ onPermission: fileHandler('PROBE_CHANGED') });
    try {
      await init(h);
      const t = await turn(h, READ_EDIT);
      const after = fs.readFileSync(file, 'utf8');
      return {
        timedOut: t.timedOut,
        permissions: h.permissions.map(reqShape),
        fileAfter: after,
        editApplied: after.includes('TWO') || after.includes('PROBE_CHANGED'),
        updatedInputHonoured: after.includes('PROBE_CHANGED'),
        resultText: resultText(t),
        ...summarize(t.messages),
      };
    } finally { h.proc.kill(); }
  },

  // Permission requests for tools that really ask: Write (allow, deny), Bash, ExitPlanMode.
  async s3_permission_shapes() {
    const out = {};
    const handler = (req) => {
      const p = req.input && req.input.file_path;
      if (req.tool_name === 'Write' && inSandbox(p, ['b.txt'])) return { behavior: 'allow', updatedInput: req.input };
      if (req.tool_name === 'Write' && inSandbox(p, ['c.txt'])) return { behavior: 'deny', message: 'probe-denied-reason: writing c.txt is not allowed' };
      if (req.tool_name === 'Bash' && String(req.input && req.input.command).trim() === 'node --version') return { behavior: 'allow', updatedInput: req.input };
      if (req.tool_name === 'ExitPlanMode') return { behavior: 'allow', updatedInput: req.input };
      return { behavior: 'deny', message: 'probe: denied' };
    };
    let h = start({ onPermission: handler });
    try {
      await init(h);
      let t = await turn(h, 'Use the Write tool to create b.txt in the current folder with the content hello. Use no other tool.');
      out.writeAllow = { timedOut: t.timedOut, permissions: h.permissions.map(reqShape), fileExists: fs.existsSync(path.join(sandbox, 'b.txt')), resultText: resultText(t) };
      let n = h.permissions.length;
      t = await turn(h, 'Use the Write tool to create c.txt in the current folder with the content nope. If it is refused, quote the refusal reason exactly.');
      out.writeDeny = { timedOut: t.timedOut, permissions: h.permissions.slice(n).map(reqShape), fileExists: fs.existsSync(path.join(sandbox, 'c.txt')), resultText: resultText(t) };
      n = h.permissions.length;
      t = await turn(h, 'Run exactly this command with the Bash tool: node --version');
      out.bashNode = { timedOut: t.timedOut, permissions: h.permissions.slice(n).map(reqShape), resultText: resultText(t) };
    } finally { h.proc.kill(); }
    h = start({ mode: 'plan', onPermission: handler });
    try {
      await init(h);
      const t = await turn(h, 'You are in plan mode. Make a short plan for creating a file hello.txt that contains the word hi. When the plan is ready you MUST call the ExitPlanMode tool to present it for approval. Do not ask questions.');
      out.planMode = { timedOut: t.timedOut, permissions: h.permissions.map(reqShape), resultText: resultText(t), ...summarize(t.messages) };
    } finally { h.proc.kill(); }
    return out;
  },

  // Runtime model switch to a model name that is not one of the 4 aliases.
  async s4_set_model() {
    const h = start();
    const out = { altModel };
    try {
      await init(h);
      let t = await turn(h, 'Reply with the single word OK.');
      out.before = { timedOut: t.timedOut, answer: resultText(t), modelsUsed: modelsUsed(t) };
      out.switchToAlt = await tryReq(h, 'set_model', { model: altModel }, 60000);
      t = await turn(h, 'Reply with the single word OK.');
      out.afterSwitch = { timedOut: t.timedOut, answer: resultText(t), isError: t.result && t.result.is_error, modelsUsed: modelsUsed(t) };
      out.switchToUnknown = await tryReq(h, 'set_model', { model: 'no-such-model-xyz' }, 60000);
      t = await turn(h, 'Reply with the single word OK.', 90000);
      out.afterUnknown = { timedOut: t.timedOut, answer: resultText(t), isError: t.result && t.result.is_error, subtype: t.result && t.result.subtype, modelsUsed: modelsUsed(t) };
      out.switchBack = await tryReq(h, 'set_model', { model: 'qwen3.8:27b' }, 60000);
      return out;
    } finally { h.proc.kill(); }
  },

  // Auto mode: does the CLI decide on its own, or still ask? (The classifier runs on the local model.)
  async s5_auto_mode() {
    const h = start({ onPermission: (req) => ({ behavior: 'deny', message: 'probe-asked: the CLI asked despite auto mode' }) });
    try {
      await init(h);
      const out = { setAuto: await tryReq(h, 'set_permission_mode', { mode: 'auto' }, 20000) };
      const t = await turn(h, 'Use the Write tool to create b.txt in the current folder with the content auto. Use no other tool.');
      out.timedOut = t.timedOut;
      out.permissionsAsked = h.permissions.map(reqShape);
      out.fileCreated = fs.existsSync(path.join(sandbox, 'b.txt'));
      out.resultText = resultText(t);
      out.notable = t.messages.filter((m) => m.type === 'system' && m.subtype !== 'init' && m.subtype !== 'status').map((m) => ({ subtype: m.subtype, data: clip(m, 300) })).slice(0, 6);
      out.setDefault = await tryReq(h, 'set_permission_mode', { mode: 'default' }, 20000);
      return out;
    } finally { h.proc.kill(); }
  },
};

(async () => {
  const names = Object.keys(probes).filter((n) => !only || only.some((o) => n.startsWith(o)));
  for (const name of names) {
    process.stdout.write(name + ' ... ');
    const t0 = Date.now();
    try {
      report.probes[name] = { ok: true, data: await probes[name]() };
      console.log('done (' + Math.round((Date.now() - t0) / 1000) + 's)');
    } catch (e) {
      report.probes[name] = { ok: false, error: String((e && e.stack) || e) };
      console.log('FAILED: ' + (e && e.message));
    }
    save();
  }
  report.finishedAt = new Date().toISOString();
  save();
  console.log('\nReport written to ' + outFile);
  process.exit(0);
})();
