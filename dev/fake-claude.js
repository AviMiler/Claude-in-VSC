#!/usr/bin/env node
// A fake Claude Code CLI speaking stream-json + the control protocol, for tests and for trying
// the UI without a model (set claudeLocal.claudePath to dev/fake-claude.cmd).
// Keywords in the user message pick a scenario:
//   "tool"   -> a Bash tool call that asks permission
//   "שאלה"   -> an AskUserQuestion card
//   "slow"   -> a long, slow reply (to try the stop button)
//   otherwise a Markdown reply (headings, list, table, code).
// FAKE_CLAUDE_INTERRUPT=no-result | error changes what follows an interrupt (no result line, or a
// result with is_error:true), to test both ways a real CLI might end a stopped turn.
const readline = require('readline');

const SESSION = process.argv.includes('--resume')
  ? process.argv[process.argv.indexOf('--resume') + 1]
  : '00000000-0000-4000-8000-000000000001';
let mode = process.argv.includes('--permission-mode') ? process.argv[process.argv.indexOf('--permission-mode') + 1] : 'default';
const allowBypass = process.argv.includes('--allow-dangerously-skip-permissions');
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

async function toolCall(name, input) {
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
  const text = ok ? (name === 'AskUserQuestion' ? `answers: ${JSON.stringify(decision.updatedInput.answers)}` : 'hi') : decision.message || 'denied';
  out({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, content: text, is_error: !ok }] }, parent_tool_use_id: null, session_id: SESSION });
  return decision;
}

async function turn(text) {
  interrupted = false;
  const started = Date.now();
  if (/tool/.test(text)) {
    await streamText('אריץ פקודה קצרה.', 5);
    await toolCall('Bash', { command: 'echo hi', description: 'Print hi' });
    await streamText('הפקודה הסתיימה.', 5);
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
    out({ type: 'system', subtype: 'init', session_id: SESSION, model: 'fake-model', permissionMode: mode, cwd: process.cwd(), tools: ['Bash'] });
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
    queue = queue.then(() => turn(text));
  }
}).on('close', () => process.exit(0));
