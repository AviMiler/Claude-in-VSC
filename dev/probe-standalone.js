// probe-standalone.js - ONE self-contained file (no other files, no npm needed). Node 18+ (22 recommended).
// Usage: node probe-standalone.js --claude "C:\\path\\claude.exe" --out probe-report.json [--only p1,p2] [--turn-timeout 180]
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

// ---------- part 4: the probes (from dev/probe-cli.js) ----------
// Dev-only feasibility probe: runs the checks from DEPENDENCIES.md against a real CLI.
// Usage: node dev/probe-cli.js [--claude <path>] [--out <report.json>] [--only p1,p2] [--turn-timeout <sec>]
// It spawns the CLI with the same arguments the extension uses, in a throw-away folder, and writes
// everything it saw to a JSON report. Nothing here is shipped with the extension.

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const claudePath = opt('claude', 'claude');
const outFile = path.resolve(opt('out', 'probe-report.json'));
const only = opt('only', '') ? opt('only').split(',') : null;
const turnTimeoutMs = Number(opt('turn-timeout', '180')) * 1000;

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-probe-'));
const report = { claudePath, sandbox, startedAt: new Date().toISOString(), probes: {} };
const save = () => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Safety filters for the auto-answered permission requests.
// Bash: only a single harmless command (ping/sleep/echo/timeout) with no shell operators.
const isSafeBash = (cmd) => {
  const c = String(cmd || '').trim().replace(/^!/, '');
  return c.length > 0 && c.length < 120 && /^(ping|sleep|echo|timeout)(\s|$)/i.test(c) && !/[&|;<>`$()\r\n]/.test(c);
};
// Edits: only the probe's own a.txt inside the throw-away folder.
const isProbeFile = (p) => {
  try { return path.resolve(String(p || '')) === path.join(sandbox, 'a.txt') || path.resolve(sandbox, String(p || '')) === path.join(sandbox, 'a.txt'); }
  catch { return false; }
};

// Starts one process; every non-control message is kept in `seen`. Tool permission requests are
// recorded and answered by `onPermission(input request) -> response`.
function start(permissionMode, onPermission) {
  const seen = [];
  const permissions = [];
  const proc = new CliProcess({ claudePath, args: buildArgs({ permissionMode }), cwd: sandbox, env: process.env });
  proc.on('message', (m) => seen.push(m));
  proc.on('controlRequest', (id, req) => {
    permissions.push({ tool: req.tool_name, input: req.input, keys: Object.keys(req) });
    const answer = req.subtype === 'can_use_tool' && onPermission
      ? onPermission(req)
      : { behavior: 'deny', message: 'probe: denied' };
    if (req.subtype === 'can_use_tool') proc.respond(id, answer);
    else proc.respondError(id, 'unsupported in probe');
  });
  return { proc, seen, permissions };
}

// Sends a user message and waits for the next `result` message (or a timeout).
function turn(h, text, timeoutMs = turnTimeoutMs) {
  const from = h.seen.length;
  const sentAt = Date.now();
  h.proc.sendUserText(text);
  return new Promise((resolve) => {
    const tick = setInterval(() => {
      const slice = h.seen.slice(from);
      const result = slice.find((m) => m.type === 'result');
      if (result || Date.now() - sentAt > timeoutMs || h.proc.exited) {
        clearInterval(tick);
        resolve({ timedOut: !result, exited: h.proc.exited, result, messages: slice });
      }
    }, 250);
  });
}

const summarize = (messages) => {
  const types = {};
  for (const m of messages) {
    const key = m.type + (m.subtype ? `/${m.subtype}` : '') + (m.type === 'stream_event' ? `/${m.event && m.event.type}` : '');
    types[key] = (types[key] || 0) + 1;
  }
  const tools = [];
  for (const m of messages) {
    if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) if (b.type === 'tool_use') tools.push(b.name);
    }
  }
  return { eventTypes: types, toolsUsed: tools };
};

const probes = {
  // Checks 1 and 2: what `initialize` returns (models, commands, agents ...).
  async p1_initialize() {
    const h = start('default');
    try {
      const res = await h.proc.request('initialize', {}, 90000);
      return {
        topLevelKeys: Object.keys(res),
        models: res.models,
        commandsCount: (res.commands || []).length,
        commands: res.commands,
        agents: res.agents,
        accountKeys: res.account && Object.keys(res.account), // values left out on purpose
        output_style: res.output_style,
      };
    } finally { h.proc.kill(); }
  },

  // Checks 6, 7, 9: which control-request subtypes exist. "unknown"/"unsupported" in the error
  // text means the CLI has no such request; any other error means it exists but rejected our dummy data.
  async p2_control_requests() {
    const h = start('default');
    try {
      await h.proc.request('initialize', {}, 90000);
      const out = {};
      const tries = [
        ['rewind_files', { user_message_id: 'dummy-id', dry_run: true }],
        ['mcp_status', {}],
        ['stop_task', { task_id: 'dummy' }],
        ['get_context_usage', {}],
        ['mcp_reconnect', { serverName: 'dummy' }],
        ['mcp_toggle', { serverName: 'dummy', enabled: false }],
      ];
      for (const [subtype, payload] of tries) {
        try { out[subtype] = { ok: true, response: await h.proc.request(subtype, payload, 20000) }; }
        catch (e) { out[subtype] = { ok: false, error: String(e.message || e) }; }
      }
      return out;
    } finally { h.proc.kill(); }
  },

  // A plain turn: which events and usage fields arrive (context meter, session usage line).
  async p3_plain_turn() {
    const h = start('default');
    try {
      await h.proc.request('initialize', {}, 90000);
      const t = await turn(h, 'Reply with the single word OK.');
      const assistant = t.messages.filter((m) => m.type === 'assistant').pop();
      return {
        timedOut: t.timedOut,
        ...summarize(t.messages),
        result: t.result,
        lastAssistantUsage: assistant && assistant.message && assistant.message.usage,
        initMessage: h.seen.find((m) => m.type === 'system' && m.subtype === 'init'),
      };
    } finally { h.proc.kill(); }
  },

  // Check 12: a second message while the first turn is still running (message queue).
  async p4_message_during_turn() {
    const h = start('default');
    try {
      await h.proc.request('initialize', {}, 90000);
      h.proc.sendUserText('Count from 1 to 40, one number per line, no other text.');
      await sleep(4000);
      const before = h.seen.length;
      h.proc.sendUserText('After that, reply with the word SECOND.');
      const deadline = Date.now() + turnTimeoutMs;
      while (Date.now() < deadline && h.seen.filter((m) => m.type === 'result').length < 2 && !h.proc.exited) await sleep(500);
      const results = h.seen.filter((m) => m.type === 'result');
      return {
        resultsReceived: results.length,
        resultTexts: results.map((r) => String(r.result || '').slice(0, 120)),
        eventsAfterSecondSend: summarize(h.seen.slice(before)),
        exited: h.proc.exited,
      };
    } finally { h.proc.kill(); }
  },

  // Checks 5, 11: slash commands in stream-json, and whether /rename writes into the transcript.
  async p5_slash_commands() {
    const h = start('default');
    const out = {};
    try {
      await h.proc.request('initialize', {}, 90000);
      await turn(h, 'Reply with the single word OK.');
      for (const cmd of ['/context', '/status', '/config', '/theme', '/compact', '/rename probe-rename-marker', '/recap', '/usage', '/hooks', '/memory']) {
        const t = await turn(h, cmd, 90000);
        out[cmd] = {
          timedOut: t.timedOut,
          resultSubtype: t.result && t.result.subtype,
          isError: t.result && t.result.is_error,
          resultText: String((t.result && t.result.result) || '').slice(0, 300),
          ...summarize(t.messages),
        };
      }
    } finally { h.proc.kill(); }
    await sleep(1000);
    const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
    const dir = path.join(base, 'projects', fs.realpathSync(sandbox).replace(/[^a-zA-Z0-9]/g, '-'));
    out.transcriptDir = dir;
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
      out.transcriptFiles = files;
      out.renameMarkerFoundInTranscript = files.some((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('probe-rename-marker'));
      out.renameLines = files.flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
        .filter((l) => l.includes('probe-rename-marker') && !l.includes('"type":"user"')).map((l) => l.slice(0, 300)));
    } catch (e) { out.transcriptError = String(e.message); }
    return out;
  },

  // Check 4: does the CLI honour `updatedInput` from a permission answer (changed edit text)?
  async p6_updated_input() {
    const file = path.join(sandbox, 'a.txt');
    fs.writeFileSync(file, 'one\ntwo\nthree\n');
    const h = start('default', (req) => {
      if (req.tool_name === 'Edit' && isProbeFile(req.input && req.input.file_path)) {
        const input = { ...req.input };
        if ('new_string' in input) input.new_string = 'PROBE_CHANGED';
        return { behavior: 'allow', updatedInput: input };
      }
      return { behavior: 'deny', message: 'probe: denied' };
    });
    try {
      await h.proc.request('initialize', {}, 90000);
      const t = await turn(h, 'Use the Edit tool on a.txt in the current folder: replace the text "two" with "TWO". Do not use any other tool.');
      return {
        timedOut: t.timedOut,
        permissionsAsked: h.permissions,
        fileAfter: fs.readFileSync(file, 'utf8'),
        updatedInputHonoured: fs.readFileSync(file, 'utf8').includes('PROBE_CHANGED'),
        ...summarize(t.messages),
      };
    } finally { h.proc.kill(); }
  },

  // Checks 7, 12: TodoWrite events, `!` shell lines, and background-task events.
  async p7_todo_shell_background() {
    const h = start('default', (req) => {
      if (req.tool_name === 'Bash' && isSafeBash(req.input && req.input.command)) {
        return { behavior: 'allow', updatedInput: req.input };
      }
      return { behavior: 'deny', message: 'probe: denied' };
    });
    const out = {};
    try {
      await h.proc.request('initialize', {}, 90000);
      let t = await turn(h, 'Use the TodoWrite tool to create a todo list with two items: "alpha" and "beta". Then stop.');
      out.todoWrite = summarize(t.messages);
      t = await turn(h, '!echo probe-shell-line', 90000);
      out.bangShell = { timedOut: t.timedOut, resultText: String((t.result && t.result.result) || '').slice(0, 300), ...summarize(t.messages) };
      t = await turn(h, 'Run the command "ping -n 15 127.0.0.1" (or "sleep 15" on Linux/Mac) with the Bash tool using run_in_background true, then tell me it started.', 120000);
      out.background = {
        timedOut: t.timedOut,
        ...summarize(t.messages),
        taskLikeMessages: h.seen.filter((m) => /task|background/i.test((m.subtype || '') + (m.type || ''))).slice(0, 10),
      };
    } finally { h.proc.kill(); }
    return out;
  },

  // Check 10: events while /loop is active.
  async p8_loop() {
    const h = start('default');
    try {
      await h.proc.request('initialize', {}, 90000);
      const from = h.seen.length;
      h.proc.sendUserText('/loop 1m reply with the word TICK');
      await sleep(25000);
      const slice = h.seen.slice(from);
      return { ...summarize(slice), sample: slice.filter((m) => m.type !== 'stream_event').slice(0, 8) };
    } finally { h.proc.kill(); }
  },
};

(async () => {
  const names = Object.keys(probes).filter((n) => !only || only.some((o) => n.startsWith(o)));
  for (const name of names) {
    process.stdout.write(`${name} ... `);
    const t0 = Date.now();
    try {
      report.probes[name] = { ok: true, data: await probes[name]() };
      console.log(`done (${Math.round((Date.now() - t0) / 1000)}s)`);
    } catch (e) {
      report.probes[name] = { ok: false, error: String((e && e.stack) || e) };
      console.log(`FAILED: ${e && e.message}`);
    }
    save();
  }
  report.finishedAt = new Date().toISOString();
  save();
  console.log(`\nReport written to ${outFile}`);
  process.exit(0);
})();
