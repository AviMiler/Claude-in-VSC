#!/usr/bin/env node
// A fake Claude Code CLI speaking stream-json + the control protocol, for tests and for trying
// the UI without a model (set claudeLocal.claudePath to dev/fake-claude.cmd).
// Keywords in the user message pick a scenario:
//   "tool"   -> a Bash tool call that asks permission
//   "edit"   -> fake Edit + Write calls (for /diff; nothing is written)
//   "tasks"  -> TaskCreate / TaskUpdate calls (Claude's pinned task list)
//   "background" -> a background Bash task (task_started / background_tasks_changed) until stop_task
//   "agent"  -> a sub-agent call (Agent tool, task_* lines, inner Glob), for the agent cards
//   "loop"   -> CronCreate, then one self-started turn after FAKE_CLAUDE_LOOP_MS (default 3000)
//   "CronDelete ... id <id>" -> CronDelete (what the /loop bar's stop button sends)
//   "שאלה"   -> an AskUserQuestion card
//   "slow"   -> a long, slow reply (to try the stop button)
//   otherwise a Markdown reply (headings, list, table, code).
// FAKE_CLAUDE_INTERRUPT=no-result | error changes what follows an interrupt (no result line, or a
// result with is_error:true), to test both ways a real CLI might end a stopped turn.
// FAKE_CLAUDE_NO_TOOLS_MODEL=<id>: when started with --model <id>, every turn fails like a model
// without tool support (DEPENDENCIES.md section 2 #26, #29). system/init reports the model and, in
// the fake-only field fake_default_models, ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL and
// ANTHROPIC_SMALL_FAST_MODEL as the CLI would see them.
// Environment as the real CLI builds it (DEPENDENCIES.md section 2 #39): the process environment,
// then a simulated ~/.claude/settings.json `env` (FAKE_CLAUDE_USER_SETTINGS_ENV, a JSON object), then
// the `env` of `--settings <json>`; invalid --settings JSON exits with an error like the CLI.
// Without --model the model is "fake-model[1m]" (window 1,000,000) unless
// CLAUDE_CODE_DISABLE_1M_CONTEXT is set, like the real default model (#40); otherwise
// get_context_usage reports CLAUDE_CODE_MAX_CONTEXT_TOKENS or 200,000.
const readline = require('readline');

const argValue = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);

function effectiveEnv() {
  let user = {};
  try {
    user = JSON.parse(process.env.FAKE_CLAUDE_USER_SETTINGS_ENV || '{}');
  } catch {
    user = {};
  }
  let flag = {};
  const raw = argValue('--settings');
  if (raw !== undefined) {
    try {
      flag = JSON.parse(raw).env || {};
    } catch (err) {
      process.stderr.write(`Error: Invalid --settings JSON: ${err.message}\n`);
      process.exit(1);
    }
  }
  return { ...process.env, ...user, ...flag };
}

const ENV = effectiveEnv();

// One-shot mode (`/btw`): `-p --output-format json` without stream-json input. The question comes
// on stdin; one result object is printed. Echoes the flags so tests can see no tools/history.
if (argValue('--output-format') === 'json' && !process.argv.includes('--input-format')) {
  let q = '';
  process.stdin.on('data', (d) => { q += d; });
  process.stdin.on('end', () => {
    const tools = process.argv.includes('--tools') ? argValue('--tools') : '(all)';
    const resume = process.argv.includes('--resume');
    const persist = !process.argv.includes('--no-session-persistence');
    const failing = q.includes('FAIL');
    process.stdout.write(`${JSON.stringify({
      type: 'result', subtype: failing ? 'error' : 'success', is_error: failing,
      result: failing ? 'fake btw failure' : `btw: ${q.trim()} [tools=${JSON.stringify(tools)} resume=${resume} persist=${persist}]`,
    })}\n`);
    process.exit(0);
  });
  return;
}
const SESSION = argValue('--resume') || '00000000-0000-4000-8000-000000000001';
let mode = argValue('--permission-mode') || 'default';
const allowBypass = process.argv.includes('--allow-dangerously-skip-permissions');
const MODEL = argValue('--model') || (ENV.CLAUDE_CODE_DISABLE_1M_CONTEXT ? 'fake-model' : 'fake-model[1m]');
const noTools = Boolean(process.env.FAKE_CLAUDE_NO_TOOLS_MODEL) && process.env.FAKE_CLAUDE_NO_TOOLS_MODEL === MODEL;
const onInterrupt = process.env.FAKE_CLAUDE_INTERRUPT || '';

const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waiting = new Map(); // request_id -> resolve
let interrupted = false;
let reqSeq = 0;
let msgSeq = 0;

const COMMANDS = [
  { name: 'compact', description: 'Clear conversation history but keep a summary in context', argumentHint: '<optional instructions>' },
  { name: 'code-review', description: 'Review the current diff for correctness bugs', argumentHint: '[low|medium|high]' },
  { name: 'my-skill', description: 'סקיל לדוגמה של המשתמש (user)', argumentHint: '' },
];
const MODELS = [
  { value: 'default', displayName: 'Default (recommended)', description: 'Use the default model' },
  { value: 'sonnet', displayName: 'Sonnet', description: 'Fast, capable' },
  { value: 'haiku', displayName: 'Haiku', description: 'Fastest' },
];

const MARKDOWN = [
  '## תשובה לדוגמה',
  '',
  'זו **תשובה מזויפת** מה-CLI המזויף, עם `קוד בתוך שורה` ו-[קישור](https://example.com).',
  '',
  '- פריט ראשון',
  '- פריט שני with English',
  '',
  '| עמודה | ערך |',
  '|---|---|',
  '| א | 1 |',
  '| ב | 2 |',
  '',
  '```js',
  'function hello(name) {',
  '  return `Hello, ${name}!`;',
  '}',
  '```',
].join('\n');

function controlRequest(subtype, payload) {
  const id = `fake-${++reqSeq}`;
  out({ type: 'control_request', request_id: id, request: { subtype, ...payload } });
  return new Promise((resolve) => waiting.set(id, resolve));
}

async function streamText(text, delay) {
  const id = `msg_fake_${++msgSeq}`;
  out({ type: 'stream_event', event: { type: 'message_start', message: { id } }, session_id: SESSION });
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, session_id: SESSION });
  for (const piece of text.match(/[\s\S]{1,12}/g) || []) {
    if (interrupted) break;
    out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: piece } }, session_id: SESSION });
    await sleep(delay);
  }
  out({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, session_id: SESSION });
  out({ type: 'assistant', message: { id, role: 'assistant', model: 'fake', content: [{ type: 'text', text }] }, parent_tool_use_id: null, session_id: SESSION });
}

// `reply` (optional) overrides the success result: { text, toolUseResult } as the real CLI sends.
async function toolCall(name, input, reply) {
  const id = `msg_fake_${++msgSeq}`;
  const toolUseId = `toolu_fake_${msgSeq}`;
  out({ type: 'stream_event', event: { type: 'message_start', message: { id } }, session_id: SESSION });
  out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: toolUseId, name, input: {} } }, session_id: SESSION });
  out({ type: 'assistant', message: { id, role: 'assistant', model: 'fake', content: [{ type: 'tool_use', id: toolUseId, name, input }] }, parent_tool_use_id: null, session_id: SESSION });
  let decision = { behavior: 'allow', updatedInput: input };
  if (mode !== 'bypassPermissions') {
    decision = await controlRequest('can_use_tool', {
      tool_name: name,
      input,
      tool_use_id: toolUseId,
      permission_suggestions: [{ type: 'addRules', rules: [{ toolName: name }], behavior: 'allow', destination: 'localSettings' }],
    });
  }
  const ok = decision.behavior === 'allow';
  let text = ok ? (name === 'AskUserQuestion' ? `answers: ${JSON.stringify(decision.updatedInput.answers)}` : 'hi') : decision.message || 'denied';
  if (ok && reply) text = reply.text;
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text, is_error: !ok }] }, tool_use_result: ok && reply ? reply.toolUseResult : undefined, parent_tool_use_id: null, session_id: SESSION });
  return decision;
}

// A foreground sub-agent as probe4 captured it: the Agent call, task_started, the sub-agent's own
// Glob call (parent_tool_use_id), task_progress, a "(no content)" tool result and the summary in
// task_notification.
async function agentScenario() {
  const agentId = `toolu_fake_agent_${++msgSeq}`;
  const inner = `toolu_fake_inner_${msgSeq}`;
  const task = { task_id: 'agent_fake_1', tool_use_id: agentId, session_id: SESSION };
  const sub = (o) => out({ ...o, parent_tool_use_id: agentId, session_id: SESSION });
  out({ type: 'assistant', message: { id: `msg_fake_${msgSeq}`, role: 'assistant', model: 'fake', content: [{ type: 'tool_use', id: agentId, name: 'Agent', input: { description: 'רשימת קבצים', prompt: 'List the files', subagent_type: 'general-purpose' } }] }, parent_tool_use_id: null, session_id: SESSION });
  out({ type: 'system', subtype: 'task_started', ...task, description: 'רשימת קבצים', subagent_type: 'general-purpose', is_backgrounded: false, spawn_depth: 1, task_type: 'local_agent', prompt: 'List the files' });
  sub({ type: 'assistant', message: { id: `msg_fake_sub_${msgSeq}`, role: 'assistant', model: 'fake', content: [{ type: 'tool_use', id: inner, name: 'Glob', input: { pattern: '*' } }] } });
  out({ type: 'system', subtype: 'task_progress', ...task, description: 'Finding *', subagent_type: 'general-purpose', usage: { total_tokens: 0, tool_uses: 1, duration_ms: 900 }, last_tool_name: 'Glob' });
  await sleep(300);
  sub({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: inner, content: 'a.js\nb.js' }] } });
  out({ type: 'system', subtype: 'task_notification', ...task, status: 'completed', summary: 'נמצאו שני קבצים: a.js, b.js', usage: { total_tokens: 0, tool_uses: 1, duration_ms: 1500 } });
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: agentId, content: [{ type: 'text', text: '(no content)' }] }] }, parent_tool_use_id: null, session_id: SESSION });
  await streamText('הסוכן סיים.', 5);
}

// The self-started /loop turn. Its exact real sequence was never captured (DEPENDENCIES.md row
// 38); this fake sends system/init, a streamed reply and a result with no user message.
let loopTimer = null;
function scheduleSelfTurn() {
  loopTimer = setTimeout(async () => {
    loopTimer = null;
    out({ type: 'system', subtype: 'init', session_id: SESSION, model: MODEL, permissionMode: mode, cwd: process.cwd(), tools: ['CronCreate', 'CronDelete', 'CronList'] });
    await streamText('PING', 5);
    out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 20, usage: { input_tokens: 100, output_tokens: 2 }, session_id: SESSION });
  }, Number(process.env.FAKE_CLAUDE_LOOP_MS) || 3000);
}

async function turn(text) {
  interrupted = false;
  const started = Date.now();
  if (noTools) {
    out({ type: 'result', subtype: 'success', is_error: true, result: `API Error: 400 litellm.BadRequestError: ${MODEL} does not support tools`, duration_ms: 10, session_id: SESSION });
    return;
  }
  if (/CronDelete/.test(text)) {
    // The stop button of the /loop bar asks Claude to run CronDelete (probe4 shapes).
    const id = (/id (\w+)/.exec(text) || [])[1] || 'unknown';
    if (loopTimer) clearTimeout(loopTimer);
    loopTimer = null;
    await toolCall('CronDelete', { id }, { text: `Cancelled job ${id}.`, toolUseResult: { id } });
    await streamText('המשימה המתוזמנת בוטלה.', 5);
  } else if (/agent/.test(text)) {
    await agentScenario();
  } else if (/loop/.test(text)) {
    // /loop as probe4 captured it: CronCreate, then (after FAKE_CLAUDE_LOOP_MS) one self-started turn.
    const job = { id: 'fakejob1', humanSchedule: 'Every minute', recurring: true, durable: false };
    await toolCall('CronCreate', { cron: '*/1 * * * *', prompt: 'Reply with the single word PING', recurring: true },
      { text: `Scheduled recurring job ${job.id} (Every minute). Session-only.`, toolUseResult: job });
    await streamText('נקבעה משימה חוזרת.', 5);
    scheduleSelfTurn();
  } else if (/tool/.test(text)) {
    await streamText('אריץ פקודה קצרה.', 5);
    await toolCall('Bash', { command: 'echo hi', description: 'Print hi' });
    await streamText('הפקודה הסתיימה.', 5);
  } else if (/background/.test(text)) {
    // A background Bash task as probe4 captured it; it keeps "running" until stop_task.
    const task = { task_id: 'bg_fake_1', task_type: 'local_bash', description: 'ping ארוך' };
    out({ type: 'system', subtype: 'task_started', ...task, tool_use_id: 'toolu_fake_bg', is_backgrounded: true, session_id: SESSION });
    out({ type: 'system', subtype: 'background_tasks_changed', tasks: [task], session_id: SESSION });
    await streamText('הפקודה רצה ברקע.', 5);
  } else if (/tasks/.test(text)) {
    // Claude's own task list, in the probe4 shapes.
    const create = (id, subject) => toolCall('TaskCreate', { subject, description: subject }, { text: `Task #${id} created successfully: ${subject}`, toolUseResult: { task: { id, subject } } });
    const update = (id, from, to) => toolCall('TaskUpdate', { taskId: id, status: to }, { text: `Updated task #${id} status`, toolUseResult: { success: true, taskId: id, updatedFields: ['status'], statusChange: { from, to } } });
    await create('1', 'לקרוא את הקוד');
    await create('2', 'לכתוב בדיקות');
    await update('1', 'pending', 'in_progress');
    await update('1', 'in_progress', 'completed');
    await update('2', 'pending', 'in_progress');
    await streamText('עבדתי לפי רשימת משימות.', 5);
  } else if (/edit/.test(text)) {
    // Fake Edit/Write calls for /diff (nothing is written to disk).
    await toolCall('Edit', { file_path: `${process.cwd()}/demo.js`, old_string: 'const a = 1;', new_string: 'const a = 2;' });
    await toolCall('Write', { file_path: `${process.cwd()}/notes.md`, content: '# הערות\n' });
    await streamText('שיניתי שני קבצים.', 5);
  } else if (/שאלה/.test(text)) {
    await toolCall('AskUserQuestion', {
      questions: [{ question: 'איזה צבע?', header: 'צבע', multiSelect: false, options: [{ label: 'כחול', description: 'צבע קר' }, { label: 'אדום', description: 'צבע חם' }] }],
    });
    await streamText('תודה על התשובה.', 5);
  } else if (/slow/.test(text)) {
    await streamText(MARKDOWN.repeat(4), 120);
  } else {
    await streamText(MARKDOWN, 5);
  }
  if (interrupted && onInterrupt === 'no-result') return;
  out({
    type: 'result',
    subtype: interrupted ? 'error_during_execution' : 'success',
    is_error: interrupted && onInterrupt === 'error',
    duration_ms: Date.now() - started,
    total_cost_usd: 0.0012,
    usage: { input_tokens: 1200, output_tokens: 340 },
    session_id: SESSION,
  });
}

function onControlRequest(msg) {
  const { subtype } = msg.request;
  const reply = (response) => out({ type: 'control_response', response: { subtype: 'success', request_id: msg.request_id, response } });
  if (subtype === 'initialize') {
    reply({ commands: COMMANDS, models: MODELS, agents: [], output_style: 'default', available_output_styles: ['default'], account: {}, pid: process.pid });
    out({ type: 'system', subtype: 'init', session_id: SESSION, model: MODEL, permissionMode: mode, cwd: process.cwd(), tools: ['Bash'],
      fake_default_models: ['DEFAULT_OPUS', 'DEFAULT_SONNET', 'DEFAULT_HAIKU', 'SMALL_FAST'].map((n) => ENV[`ANTHROPIC_${n}_MODEL`] || null) });
  } else if (subtype === 'interrupt') {
    interrupted = true;
    reply({});
  } else if (subtype === 'set_permission_mode') {
    if (msg.request.mode === 'bypassPermissions' && !allowBypass) {
      // The real CLI's wording (2.1.181).
      out({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: 'Cannot set permission mode to bypassPermissions because the session was not launched with --dangerously-skip-permissions' } });
      return;
    }
    mode = msg.request.mode;
    reply({});
  } else if (subtype === 'set_model') {
    reply({});
  } else if (subtype === 'get_context_usage') {
    const maxTokens = /\[1m\]$/i.test(MODEL) ? 1000000 : Number(ENV.CLAUDE_CODE_MAX_CONTEXT_TOKENS) || 200000;
    reply({ categories: [], totalTokens: 23400, maxTokens, model: MODEL });
  } else if (subtype === 'stop_task') {
    // The sequence probe4 captured after a stop.
    const id = msg.request.task_id;
    reply({});
    out({ type: 'system', subtype: 'background_tasks_changed', tasks: [], session_id: SESSION });
    out({ type: 'system', subtype: 'task_updated', task_id: id, patch: { status: 'killed', end_time: Date.now() }, session_id: SESSION });
    out({ type: 'system', subtype: 'task_notification', task_id: id, tool_use_id: 'toolu_fake_bg', status: 'stopped', output_file: '', summary: 'נעצר', session_id: SESSION });
  } else if (subtype === 'rewind_files') {
    // Mirrors the real CLI's gate (DEPENDENCIES.md finding 23); nothing is written.
    if (process.env.CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING !== '1') {
      out({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: 'File rewinding is not enabled' } });
    } else reply(msg.request.dry_run ? { filesChanged: ['demo.js'] } : {});
  } else {
    out({ type: 'control_response', response: { subtype: 'error', request_id: msg.request_id, error: `unknown ${subtype}` } });
  }
}

let queue = Promise.resolve();
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.type === 'control_request') return onControlRequest(msg);
  if (msg.type === 'control_response') {
    const resolve = waiting.get(msg.response.request_id);
    waiting.delete(msg.response.request_id);
    if (resolve) resolve(msg.response.response);
    return;
  }
  if (msg.type === 'user') {
    const text = msg.message.content.map((b) => b.text || '').join('');
    // --replay-user-messages echoes the prompt with the uuid that rewind_files takes.
    if (process.argv.includes('--replay-user-messages')) out({ ...msg, uuid: `fake-uuid-${++msgSeq}`, session_id: SESSION });
    queue = queue.then(() => turn(text));
  }
}).on('close', () => process.exit(0));
