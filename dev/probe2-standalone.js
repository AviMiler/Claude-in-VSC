// probe2-standalone.js - ONE self-contained file (no other files, no npm needed). Node 18+ (22 recommended).
// Usage: node probe2-standalone.js --claude "C:\\path\\claude-bin.exe" --out probe2-report.json [--only q1,q3] [--turn-timeout 240]
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
const outFile = path.resolve(opt('out', 'probe2-report.json'));
const only = opt('only', '') ? opt('only').split(',') : null;
const turnTimeoutMs = Number(opt('turn-timeout', '240')) * 1000;
const quick = argv.includes('--quick'); // only for testing the script itself

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-probe2-'));
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

const probes = {
  // R4: file rewind. Uses the SDK-style switches (env var + --replay-user-messages).
  async q1_rewind() {
    const file = makeA();
    const h = start({ env: { CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1' }, extraArgs: ['--replay-user-messages'], onPermission: editHandler() });
    try {
      await init(h);
      const t = await turn(h, READ_EDIT);
      const out = { timedOut: t.timedOut, afterEdit: fs.readFileSync(file, 'utf8'), permissionsAsked: h.permissions.map((p) => p.tool), ...summarize(t.messages) };
      const userMsgs = h.seen.filter((m) => m.type === 'user' && m.uuid
        && !(m.message && Array.isArray(m.message.content) && m.message.content.some((b) => b.type === 'tool_result')));
      out.userMessageCandidates = userMsgs.slice(0, 3).map((m) => ({ uuid: m.uuid, isReplay: m.isReplay, content: clip(m.message && m.message.content, 120) }));
      out.rewind = {};
      if (userMsgs.length) {
        const id = userMsgs[0].uuid;
        out.rewind.dryRun = await tryReq(h, 'rewind_files', { user_message_id: id, dry_run: true });
        out.rewind.real = await tryReq(h, 'rewind_files', { user_message_id: id });
        out.afterRewind = fs.readFileSync(file, 'utf8');
        out.fileRestored = out.afterRewind.includes('two') && !out.afterRewind.includes('TWO');
      } else {
        out.rewind.note = 'no user message uuid was echoed (--replay-user-messages may not be supported)';
      }
      return out;
    } finally { h.proc.kill(); }
  },

  // R5: does the CLI use the changed input we return for an Edit permission request?
  async q2_updated_input() {
    const file = makeA();
    const h = start({ onPermission: editHandler('PROBE_CHANGED') });
    try {
      await init(h);
      const t = await turn(h, READ_EDIT);
      const after = fs.readFileSync(file, 'utf8');
      return {
        timedOut: t.timedOut,
        permissionRequests: h.permissions.map((p) => ({ tool: p.tool, requestKeys: Object.keys(p.request), input: clip(p.input, 300) })),
        fileAfter: after,
        updatedInputHonoured: after.includes('PROBE_CHANGED'),
        resultText: resultText(t),
        ...summarize(t.messages),
      };
    } finally { h.proc.kill(); }
  },

  // R6: exact shape of permission requests and of our answers (allow, deny, question, plan).
  async q3_permission_shapes() {
    const out = {};
    const handler = (req) => {
      if (req.tool_name === 'Bash' && answers.mode === 'allow' && isSafeBash(req.input && req.input.command)) {
        return { behavior: 'allow', updatedInput: req.input };
      }
      if (req.tool_name === 'Bash') return { behavior: 'deny', message: 'probe-denied-reason: not allowed in this test' };
      if (req.tool_name === 'AskUserQuestion') {
        const picked = {};
        for (const q of (req.input && req.input.questions) || []) picked[q.question] = (q.options && q.options[0] && q.options[0].label) || 'x';
        return { behavior: 'allow', updatedInput: { ...req.input, answers: picked } };
      }
      if (req.tool_name === 'ExitPlanMode') return { behavior: 'allow', updatedInput: req.input };
      return { behavior: 'deny', message: 'probe: denied' };
    };
    let h = start({ onPermission: handler });
    try {
      await init(h);
      answers.mode = 'allow';
      let t = await turn(h, 'Run exactly this command with the Bash tool: echo shape-test');
      out.bashAllow = {
        timedOut: t.timedOut,
        permissions: h.permissions.map((p) => ({ tool: p.tool, requestKeys: Object.keys(p.request), suggestions: clip(p.request.permission_suggestions, 500), input: clip(p.input, 200) })),
        resultText: resultText(t),
      };
      answers.mode = 'deny';
      const before = h.permissions.length;
      t = await turn(h, 'Now run exactly this command with the Bash tool: echo second-test. If it is refused, quote the refusal reason.');
      out.bashDeny = { timedOut: t.timedOut, newPermissions: h.permissions.length - before, resultText: resultText(t) };
      answers.mode = 'allow';
      const before2 = h.permissions.length;
      t = await turn(h, 'Use the AskUserQuestion tool to ask me which color I prefer (options: red, blue). Then tell me which answer you received.');
      out.askUserQuestion = {
        timedOut: t.timedOut,
        requests: h.permissions.slice(before2).map((p) => ({ tool: p.tool, input: clip(p.input, 600) })),
        resultText: resultText(t),
      };
    } finally { h.proc.kill(); }
    h = start({ mode: 'plan', onPermission: handler });
    try {
      await init(h);
      const t = await turn(h, 'Make a short plan for creating a file hello.txt that contains the word hi, then present the plan for approval.');
      out.planMode = {
        timedOut: t.timedOut,
        requests: h.permissions.map((p) => ({ tool: p.tool, requestKeys: Object.keys(p.request), input: clip(p.input, 600) })),
        resultText: resultText(t),
        ...summarize(t.messages),
      };
    } finally { h.proc.kill(); }
    return out;
  },

  // R7: which permission modes the CLI accepts at runtime (including auto).
  async q4_modes() {
    const h = start();
    try {
      const res = await init(h);
      const out = { initialMode: res.current_permission_mode, modes: {} };
      for (const m of ['acceptEdits', 'plan', 'default', 'auto', 'dontAsk', 'bypassPermissions']) {
        out.modes[m] = await tryReq(h, 'set_permission_mode', { mode: m }, 20000);
      }
      await tryReq(h, 'set_permission_mode', { mode: 'default' }, 20000);
      return out;
    } finally { h.proc.kill(); }
  },

  // R8: does the model see images? A 64x64 PNG, left half red, right half blue.
  async q5_vision() {
    const h = start();
    try {
      await init(h);
      const t = await turn(h, [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
        { type: 'text', text: 'This image is split into a left half and a right half. Answer in the form "left=<color> right=<color>" and nothing else.' },
      ]);
      const text = String((t.result && t.result.result) || '');
      return {
        timedOut: t.timedOut,
        isError: t.result && t.result.is_error,
        answer: clip(text, 300),
        looksCorrect: /left\s*=\s*red/i.test(text) && /right\s*=\s*blue/i.test(text),
        ...summarize(t.messages),
      };
    } finally { h.proc.kill(); }
  },

  // R9: does thinking actually happen, and does /effort change anything?
  async q6_thinking_effort() {
    const h = start();
    const out = {};
    const ask = async (label) => {
      const t = await turn(h, 'What is 17 times 23? Think it through, then answer with the number only.');
      const r = t.result || {};
      out[label] = {
        timedOut: t.timedOut,
        answer: clip(r.result || '', 100),
        thinkingTokens: r.usage && r.usage.output_tokens_details && r.usage.output_tokens_details.thinking_tokens,
        outputTokens: r.usage && r.usage.output_tokens,
        durationMs: r.duration_ms,
        contentBlockTypes: summarize(t.messages).contentBlockTypes,
      };
    };
    try {
      await init(h);
      await ask('default');
      let t = await turn(h, '/effort high', 120000);
      out.effortHighReply = resultText(t);
      await ask('afterEffortHigh');
      t = await turn(h, '/effort low', 120000);
      out.effortLowReply = resultText(t);
      await ask('afterEffortLow');
      return out;
    } finally { h.proc.kill(); }
  },

  // R10: MCP status / reconnect / toggle on the real configured servers (restored at the end).
  async q7_mcp() {
    const h = start();
    const out = {};
    try {
      await init(h);
      out.statusAtStart = await tryReq(h, 'mcp_status', {});
      await sleep(15000);
      const st = await tryReq(h, 'mcp_status', {});
      out.statusAfter15s = st;
      const servers = (st.ok && st.response && st.response.mcpServers) || [];
      if (servers.length) {
        const name = servers[0].name;
        out.target = name;
        out.reconnect = await tryReq(h, 'mcp_reconnect', { serverName: name });
        await sleep(8000);
        out.statusAfterReconnect = await tryReq(h, 'mcp_status', {});
        out.disable = await tryReq(h, 'mcp_toggle', { serverName: name, enabled: false });
        out.statusDisabled = await tryReq(h, 'mcp_status', {});
        out.enable = await tryReq(h, 'mcp_toggle', { serverName: name, enabled: true });
        await sleep(8000);
        out.statusEnabled = await tryReq(h, 'mcp_status', {});
      } else {
        out.note = 'no MCP servers configured';
      }
      return out;
    } finally { h.proc.kill(); }
  },

  // R11: what a /loop looks like on the wire (it is a skill that uses the Cron tools).
  async q8_loop() {
    const h = start({ onPermission: (req) => (/^(CronCreate|CronList|CronDelete|ScheduleWakeup)$/.test(req.tool_name) || (req.tool_name === 'Bash' && isSafeBash(req.input && req.input.command)) ? { behavior: 'allow', updatedInput: req.input } : { behavior: 'deny', message: 'probe: denied' }) });
    try {
      await init(h);
      const from = h.seen.length;
      h.proc.send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: '/loop 1m reply with the word TICK' }] } });
      const deadline = Date.now() + (quick ? 3000 : 150000);
      while (Date.now() < deadline && !h.seen.slice(from).some((m) => m.type === 'result') && !h.proc.exited) await sleep(1000);
      const afterFirst = h.seen.length;
      await sleep(75000);
      const all = h.seen.slice(from);
      return {
        firstResultSeen: h.seen.slice(from, afterFirst).some((m) => m.type === 'result'),
        ...summarize(all),
        eventsAfterFirstResult: summarize(h.seen.slice(afterFirst)).eventTypes,
        notableMessages: all.filter((m) => m.type !== 'stream_event' && m.type !== 'assistant')
          .map((m) => ({ type: m.type, subtype: m.subtype, data: clip(m.result || m.tasks || m.status || m.message || '', 200) })).slice(0, 25),
        permissionsAsked: h.permissions.map((p) => ({ tool: p.tool, input: clip(p.input, 200) })),
      };
    } finally { h.proc.kill(); }
  },

  // R12: interrupt, resume and fork.
  async q9_interrupt_resume() {
    const out = {};
    let h = start();
    let sessionId;
    try {
      await init(h);
      await turn(h, 'Remember this word: pineapple. Reply with OK.');
      sessionId = sessionIdOf(h);
      out.sessionId = sessionId;
      const from = h.seen.length;
      h.proc.sendUserText('Count slowly from 1 to 300, one number per line, no other text.');
      await sleep(8000);
      const t0 = Date.now();
      out.interruptRequest = await tryReq(h, 'interrupt', {}, 15000);
      while (Date.now() - t0 < (quick ? 1000 : 25000) && !h.seen.slice(from).some((m) => m.type === 'result') && !h.proc.exited) await sleep(500);
      const res = h.seen.slice(from).find((m) => m.type === 'result');
      out.afterInterrupt = { msToResult: res ? Date.now() - t0 : null, resultSubtype: res && res.subtype, isError: res && res.is_error, terminalReason: res && res.terminal_reason, processExited: h.proc.exited };
      if (!h.proc.exited) {
        const t = await turn(h, 'Reply with the word ALIVE.', 90000);
        out.aliveAfterInterrupt = { timedOut: t.timedOut, text: resultText(t) };
      }
    } finally { h.proc.kill(); }
    if (!sessionId) return out;
    await sleep(2000);
    h = start({ resume: sessionId });
    try {
      await init(h);
      const t = await turn(h, 'What word did I ask you to remember? Answer with just the word.');
      out.resume = { timedOut: t.timedOut, answer: resultText(t), sessionIdAfterResume: sessionIdOf(h) };
    } finally { h.proc.kill(); }
    await sleep(2000);
    h = start({ resume: sessionId, fork: true });
    try {
      await init(h);
      const t = await turn(h, 'What word did I ask you to remember? Answer with just the word.');
      const newId = sessionIdOf(h);
      out.fork = { timedOut: t.timedOut, answer: resultText(t), newSessionId: newId, differsFromOriginal: !!newId && newId !== sessionId };
    } finally { h.proc.kill(); }
    return out;
  },

  // R13: the "!" shell mode over stream-json.
  async q10_bang_shell() {
    const h = start({ onPermission: (req) => (req.tool_name === 'Bash' && isSafeBash(req.input && req.input.command) ? { behavior: 'allow', updatedInput: req.input } : { behavior: 'deny', message: 'probe: denied' }) });
    try {
      await init(h);
      const t = await turn(h, '!echo probe-bang-777', 120000);
      return {
        timedOut: t.timedOut,
        resultText: resultText(t),
        permissionsAsked: h.permissions.map((p) => ({ tool: p.tool, input: clip(p.input, 200) })),
        notableMessages: t.messages.filter((m) => m.type !== 'stream_event')
          .map((m) => ({ type: m.type, subtype: m.subtype, data: clip(m.message || m.content || m.result || '', 300) })).slice(0, 12),
        ...summarize(t.messages),
      };
    } finally { h.proc.kill(); }
  },
};

(async () => {
  const names = Object.keys(probes).filter((n) => !only || only.some((o) => n === o || n.startsWith(o + '_')));
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
