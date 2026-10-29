// Runs the real CliProcess against dev/fake-claude.js over a pipe.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { CliProcess } = require('../src/cli/process');
const { buildArgs } = require('../src/cli/args');
const { createStreamTranslator } = require('../src/panels/event-translator');

const FAKE = path.join(__dirname, '..', 'dev', 'fake-claude.js');
const FAKE_CMD = path.join(__dirname, '..', 'dev', 'fake-claude.cmd');

function start(extraArgs = {}, claudePath = process.execPath, prefix = [FAKE]) {
  return new CliProcess({ claudePath, args: [...prefix, ...buildArgs(extraArgs)], cwd: process.cwd() });
}

function collect(proc) {
  const translate = createStreamTranslator();
  const events = [];
  proc.on('message', (m) => events.push(...translate(m)));
  return events;
}

function waitFor(proc, events, pred, ms = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    const check = () => {
      if (pred(events)) {
        clearTimeout(timer);
        proc.off('message', onMsg);
        resolve();
      }
    };
    const onMsg = () => setImmediate(check);
    proc.on('message', onMsg);
    check();
  });
}

test('initialize returns commands and models', async () => {
  const proc = start();
  const info = await proc.request('initialize');
  assert.ok(info.commands.some((c) => c.name === 'compact'));
  assert.ok(info.models.some((m) => m.value === 'default'));
  proc.kill();
});

test('a reply streams and ends with one final text block and a result', async () => {
  const proc = start();
  const events = collect(proc);
  await proc.request('initialize');
  proc.sendUserText('hello');
  await waitFor(proc, events, (e) => e.some((x) => x.kind === 'result'));
  const deltas = events.filter((e) => e.kind === 'delta');
  const finals = events.filter((e) => e.kind === 'block');
  assert.ok(deltas.length > 1);
  assert.strictEqual(finals.length, 1);
  assert.strictEqual(finals[0].key, deltas[0].key, 'final block reuses the streamed key');
  assert.strictEqual(deltas.map((d) => d.text).join(''), finals[0].text);
  assert.ok(events.some((e) => e.kind === 'session'));
  proc.kill();
});

test('can_use_tool reaches us and our answer reaches the CLI', async () => {
  const proc = start();
  const events = collect(proc);
  proc.on('controlRequest', (id, req) => {
    assert.strictEqual(req.subtype, 'can_use_tool');
    assert.strictEqual(req.tool_name, 'Bash');
    proc.respond(id, { behavior: 'deny', message: 'no thanks' });
  });
  proc.sendUserText('run a tool');
  await waitFor(proc, events, (e) => e.some((x) => x.kind === 'result'));
  const result = events.find((e) => e.kind === 'toolResult');
  assert.strictEqual(result.isError, true);
  assert.strictEqual(result.text, 'no thanks');
  proc.kill();
});

test('interrupt stops a slow reply', async () => {
  const proc = start();
  const events = collect(proc);
  proc.sendUserText('slow please');
  await waitFor(proc, events, (e) => e.filter((x) => x.kind === 'delta').length > 2);
  await proc.interrupt();
  await waitFor(proc, events, (e) => e.some((x) => x.kind === 'result'));
  assert.strictEqual(events.find((e) => e.kind === 'result').isError, true);
  proc.kill();
});

test('a .cmd path with spaces runs through cmd.exe', { skip: process.platform !== 'win32' }, async () => {
  const proc = start({}, FAKE_CMD, []);
  const info = await proc.request('initialize');
  assert.ok(info.commands.length > 0);
  proc.kill();
});

test('a missing executable reports a spawn error on exit', async () => {
  const proc = new CliProcess({ claudePath: 'definitely-not-claude-xyz', args: [], cwd: process.cwd() });
  const info = await new Promise((resolve) => proc.on('exit', resolve));
  assert.ok(info.error);
});
