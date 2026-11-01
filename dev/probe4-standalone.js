// probe4-standalone.js - ONE self-contained file (no other files, no npm needed). Node 18+ (22 recommended).
// Captures the raw CLI message formats that package B2 still needs: background tasks + stop_task,
// TaskCreate/TaskUpdate, sub-agent (Agent/Task tool) events, and /loop (CronCreate/CronList + the self-started turn).
// Usage: node probe4-standalone.js --claude "C:\path\claude-bin.exe" --out probe4-report.json [--only t1,t3] [--turn-timeout 240]
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

// ---------- part 4: raw message formats for package B2 ----------
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const claudePath = opt('claude', 'claude');
const outFile = path.resolve(opt('out', 'probe4-report.json'));
const only = opt('only', '') ? opt('only').split(',') : null;
const turnTimeoutMs = Number(opt('turn-timeout', '240')) * 1000;
const loopWaitMs = Number(opt('loop-wait', '90')) * 1000;

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-probe4-'));
const report = { claudePath, sandbox, startedAt: new Date().toISOString(), probes: {} };
const save = () => fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (v, n = 1500) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > n ? s.slice(0, n) + '...' : s;
};

// Only one simple command (ping/sleep/echo/timeout, no shell operators) is ever auto-approved.
const isSafeBash = (cmd) => {
  const c = String(cmd || '').trim();
  return c.length > 0 && c.length < 120 && /^(ping|sleep|echo|timeout)(\s|$)/i.test(c) && !/[&|;<>`$()\r\n]/.test(c);
};
const TASK_TOOLS = ['TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'CronCreate', 'CronList', 'CronDelete', 'ScheduleWakeup'];
const AGENT_TOOLS = ['Agent', 'Task'];
const READ_TOOLS = ['Read', 'Glob', 'Grep', 'LS'];

// Every permission request is recorded; only the narrow set above is allowed.
const handler = (req) => {
  const name = req.tool_name;
  if (name === 'Bash' && isSafeBash(req.input && req.input.command)) return { behavior: 'allow', updatedInput: req.input };
  if (TASK_TOOLS.includes(name) || AGENT_TOOLS.includes(name)) return { behavior: 'allow', updatedInput: req.input };
  if (READ_TOOLS.includes(name)) return { behavior: 'allow', updatedInput: req.input };
  return { behavior: 'deny', message: 'probe: denied' };
};

function start({ mode = 'default', extraArgs = [], env = {} } = {}) {
  const seen = [];
  const permissions = [];
  const args = buildArgs({ permissionMode: mode }).concat(extraArgs);
  const proc = new CliProcess({ claudePath, args, cwd: sandbox, env: { ...process.env, ...env } });
  proc.on('message', (m) => seen.push({ at: Date.now(), m }));
  proc.on('controlRequest', (id, req) => {
    if (req.subtype === 'can_use_tool') {
      permissions.push({ tool: req.tool_name, input: clip(req.input, 300) });
      proc.respond(id, handler(req));
    } else {
      permissions.push({ other: req.subtype });
      proc.respondError(id, 'unsupported in probe');
    }
  });
  return { proc, seen, permissions };
}

const msgs = (h, from = 0) => h.seen.slice(from).map((x) => x.m);
const init = (h) => h.proc.request('initialize', {}, 90000);
const tryReq = async (h, subtype, payload, ms = 30000) => {
  try { return { ok: true, response: await h.proc.request(subtype, payload, ms) }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
};

// Sends one user message and waits for the next `result` (or the timeout).
function turn(h, text, timeoutMs = turnTimeoutMs) {
  const from = h.seen.length;
  const sentAt = Date.now();
  h.proc.send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
  return new Promise((resolve) => {
    const tick = setInterval(() => {
      const result = msgs(h, from).find((m) => m.type === 'result');
      if (result || Date.now() - sentAt > timeoutMs || h.proc.exited) {
        clearInterval(tick);
        resolve({ timedOut: !result, from, result });
      }
    }, 250);
  });
}

// The parts B2 needs, verbatim: system events, tool_use blocks and tool_result blocks.
const raw = (messages) => {
  const out = [];
  for (const m of messages) {
    if (m.type === 'system' && m.subtype !== 'init' && m.subtype !== 'status') out.push({ kind: 'system', subtype: m.subtype, json: clip(m) });
    else if (m.type === 'assistant' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) {
        if (b.type === 'tool_use') out.push({ kind: 'tool_use', name: b.name, id: b.id, parent: m.parent_tool_use_id || null, input: clip(b.input, 800) });
      }
    } else if (m.type === 'user' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) {
        if (b.type === 'tool_result') out.push({ kind: 'tool_result', id: b.tool_use_id, parent: m.parent_tool_use_id || null, content: clip(b.content, 800), toolUseResult: clip(m.tool_use_result, 800) });
      }
    }
  }
  return out;
};
const withParent = (messages) => messages.filter((m) => m.parent_tool_use_id).length;
const finalText = (t) => clip((t.result && t.result.result) || '', 300);
const field = (h, from, pred) => msgs(h, from).find(pred);

const probes = {
  // A Bash command started in the background: which events announce it, its task id, and what stop_task answers.
  async t1_background_stop() {
    const h = start();
    const out = {};
    try {
      await init(h);
      const t = await turn(h, 'Use the Bash tool with run_in_background set to true to run exactly this command: ping -n 40 127.0.0.1 . Do not wait for it. Then reply with the word STARTED.');
      out.turn = { timedOut: t.timedOut, answer: finalText(t) };
      out.events = raw(msgs(h, t.from));
      const ids = [];
      for (const m of msgs(h, t.from)) {
        if (m.type === 'system' && m.task_id) ids.push(m.task_id);
        if (m.type === 'system' && Array.isArray(m.tasks)) for (const k of m.tasks) if (k && k.task_id) ids.push(k.task_id);
      }
      out.taskIds = [...new Set(ids)];
      if (out.taskIds.length) {
        const from = h.seen.length;
        out.stopTask = await tryReq(h, 'stop_task', { task_id: out.taskIds[0] }, 20000);
        await sleep(4000);
        out.afterStop = raw(msgs(h, from));
      } else {
        out.stopTask = 'no task id found in system events (see events)';
      }
      return out;
    } finally { h.proc.kill(); }
  },

  // A foreground command that runs for a while: what the stream looks like meanwhile, and what the CLI
  // answers to a few guessed control subtypes (the error text shows which subtypes exist).
  async t2_foreground_running() {
    const h = start();
    const out = {};
    try {
      await init(h);
      const from = h.seen.length;
      h.proc.send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Use the Bash tool (foreground) to run exactly this command: ping -n 25 127.0.0.1 . Then reply with the word DONE.' }] } });
      await sleep(12000);
      out.whileRunning = raw(msgs(h, from));
      out.guesses = {};
      for (const sub of ['background_task', 'move_to_background', 'background_current_tool', 'list_tasks']) {
        out.guesses[sub] = await tryReq(h, sub, {}, 8000);
      }
      out.afterGuesses = raw(msgs(h, from));
      await h.proc.stop();
      return out;
    } finally { h.proc.kill(); }
  },

  // Claude's own task list: exact inputs and results of TaskCreate / TaskUpdate / TaskList.
  async t3_task_list() {
    const h = start();
    try {
      await init(h);
      const t = await turn(h, 'Use the TaskCreate tool to create three tasks titled "one", "two" and "three". Then use TaskUpdate to mark "one" completed and "two" in progress. Then call TaskList once. Use no other tool. Finish with the word LISTED.');
      return { timedOut: t.timedOut, answer: finalText(t), permissions: h.permissions, events: raw(msgs(h, t.from)) };
    } finally { h.proc.kill(); }
  },

  // Sub-agents: does the local model launch one at all, and how do its inner messages carry parent_tool_use_id?
  async t4_subagent() {
    const h = start();
    try {
      await init(h);
      const t = await turn(h, 'Use the Agent tool (also called Task) to launch ONE sub-agent whose job is to list the files in the current folder with the LS or Glob tool and report their names. Wait for it and then quote its report.');
      const all = msgs(h, t.from);
      return {
        timedOut: t.timedOut, answer: finalText(t), permissions: h.permissions,
        messagesWithParent: withParent(all),
        systemTaskEvents: all.filter((m) => m.type === 'system' && /task/.test(m.subtype || '')).map((m) => clip(m, 600)),
        events: raw(all),
      };
    } finally { h.proc.kill(); }
  },

  // /loop: CronCreate input/result, CronList result, the turn that starts by itself, and CronDelete.
  async t5_loop() {
    const h = start();
    const out = {};
    try {
      await init(h);
      const t = await turn(h, '/loop 1m Reply with the single word PING');
      out.create = { timedOut: t.timedOut, answer: finalText(t), events: raw(msgs(h, t.from)) };
      const from = h.seen.length;
      out.cronList = await (async () => {
        const l = await turn(h, 'Call the CronList tool once and show its raw result. Use no other tool.');
        return { timedOut: l.timedOut, events: raw(msgs(h, l.from)) };
      })();
      const waitFrom = h.seen.length;
      await sleep(loopWaitMs);
      const waited = msgs(h, waitFrom);
      out.selfStartedTurn = {
        waitedSeconds: loopWaitMs / 1000,
        sawResultWithoutUserMessage: waited.some((m) => m.type === 'result'),
        systemEvents: waited.filter((m) => m.type === 'system' && m.subtype !== 'status').map((m) => clip(m, 600)),
        events: raw(waited),
      };
      const d = await turn(h, 'Call the CronDelete tool for every scheduled job so none is left. Use no other tool.');
      out.cronDelete = { timedOut: d.timedOut, events: raw(msgs(h, d.from)) };
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
