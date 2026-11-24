// M-3: the initialize payload carries the navigation guidance only when the nav server started and the setting is on.
const test = require('node:test');
const assert = require('node:assert');
const { NAV_GUIDANCE, initializePayload } = require('../src/mcp/nav-guidance');
const { CliProcess } = require('../src/cli/process');

test('payload has appendSystemPrompt when nav started and the setting is on', () => {
  assert.deepStrictEqual(initializePayload(true, true), { appendSystemPrompt: NAV_GUIDANCE });
});

test('payload has no appendSystemPrompt when the nav server did not start', () => {
  assert.deepStrictEqual(initializePayload(false, true), {});
});

test('payload has no appendSystemPrompt when the setting is off', () => {
  assert.deepStrictEqual(initializePayload(true, false), {});
});

test('the guidance names only real tools and no mcp__ prefix', () => {
  const source = require('fs').readFileSync(require.resolve('../src/mcp/nav-tools'), 'utf8');
  assert.ok(!NAV_GUIDANCE.includes('mcp__'));
  for (const name of ['documentSymbols', 'readSymbol', 'findReferences', 'goToDefinition', 'workspaceSymbols', 'getDiagnostics']) {
    assert.ok(NAV_GUIDANCE.includes(name));
    assert.ok(source.includes(`name: '${name}'`));
  }
});

// A child that echoes every stdin line back as {type:'echo', line}.
const ECHO = 'require("readline").createInterface({input:process.stdin}).on("line",l=>process.stdout.write(JSON.stringify({type:"echo",line:l})+"\\n"))';
const FAKE_TOOLS = { list: [{ name: 'x', description: '', inputSchema: { type: 'object' } }], call: async () => ({}) };

async function firstLines(navTools, guidanceOn) {
  const proc = new CliProcess({ claudePath: process.execPath, args: ['-e', ECHO, '--'], cwd: process.cwd(), navTools });
  const lines = [];
  proc.on('message', (m) => m.type === 'echo' && lines.push(JSON.parse(m.line)));
  proc.request('initialize', () => initializePayload(!!proc.nav, guidanceOn), 5000).catch(() => {});
  proc.sendUserText('hello');
  proc.request('set_permission_mode', { mode: 'plan' }, 5000).catch(() => {});
  const deadline = Date.now() + 5000;
  while (lines.length < 3 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
  proc.kill();
  return lines;
}

test('initialize is written first and carries the guidance when nav started', async () => {
  const lines = await firstLines(FAKE_TOOLS, true);
  assert.strictEqual(lines[0].request.subtype, 'initialize');
  assert.strictEqual(lines[0].request.appendSystemPrompt, NAV_GUIDANCE);
  assert.strictEqual(lines[1].type, 'user');
  assert.strictEqual(lines[2].request.subtype, 'set_permission_mode');
});

test('initialize is written first and has no guidance without nav', async () => {
  const lines = await firstLines(null, true);
  assert.strictEqual(lines[0].request.subtype, 'initialize');
  assert.ok(!('appendSystemPrompt' in lines[0].request));
  assert.strictEqual(lines[1].type, 'user');
});

test('initialize has no guidance when the setting is off, even with nav', async () => {
  const lines = await firstLines(FAKE_TOOLS, false);
  assert.strictEqual(lines[0].request.subtype, 'initialize');
  assert.ok(!('appendSystemPrompt' in lines[0].request));
});
