const test = require('node:test');
const assert = require('node:assert');
const { buildAddArgs, buildRemoveArgs, tokenize, parseEnvLines } = require('../src/mcp/mcp-args');
const { normalizeServers } = require('../src/mcp/mcp-model');

test('tokenize keeps quoted parts together', () => {
  assert.deepStrictEqual(tokenize('npx -y "my pkg" x'), ['npx', '-y', 'my pkg', 'x']);
  assert.deepStrictEqual(tokenize(''), []);
});

test('parseEnvLines splits KEY=VALUE and rejects lines without a key', () => {
  assert.deepStrictEqual(parseEnvLines('A=1\n\nB=x=y').env, [['A', '1'], ['B', 'x=y']]);
  assert.ok(parseEnvLines('=1').error);
  assert.ok(parseEnvLines('novalue').error);
});

test('buildAddArgs: stdio server with env and scope', () => {
  const r = buildAddArgs({ name: 'srv', scope: 'user', transport: 'stdio', target: 'npx -y pkg', env: 'K=V' });
  assert.deepStrictEqual(r.args, ['mcp', 'add', '-s', 'user', '-e', 'K=V', 'srv', '--', 'npx', '-y', 'pkg']);
});

test('buildAddArgs: http needs a single http(s) URL; unknown scope falls back to local', () => {
  const r = buildAddArgs({ name: 's', scope: 'x', transport: 'http', target: 'https://h/mcp' });
  assert.deepStrictEqual(r.args, ['mcp', 'add', '-s', 'local', '--transport', 'http', 's', '--', 'https://h/mcp']);
  assert.ok(buildAddArgs({ name: 's', transport: 'sse', target: 'ftp://h' }).error);
  assert.ok(buildAddArgs({ name: 's', transport: 'http', target: 'https://a https://b' }).error);
});

test('buildAddArgs rejects bad names, empty targets and shell metacharacters', () => {
  assert.ok(buildAddArgs({ name: 'bad name', target: 'x' }).error);
  assert.ok(buildAddArgs({ name: 'a', target: '' }).error);
  assert.ok(buildAddArgs({ name: 'a', target: 'x & calc' }).error);
  assert.ok(buildAddArgs({ name: 'a', target: 'x %PATH%' }).error);
  assert.ok(buildAddArgs({ name: 'a', target: 'x', env: 'K=a|b' }).error);
});

test('buildRemoveArgs validates the name and passes a known scope', () => {
  assert.deepStrictEqual(buildRemoveArgs('srv', 'project').args, ['mcp', 'remove', 'srv', '-s', 'project']);
  assert.deepStrictEqual(buildRemoveArgs('srv').args, ['mcp', 'remove', 'srv']);
  assert.ok(buildRemoveArgs('a;b').error);
});

test('normalizeServers reads status defensively', () => {
  const rows = normalizeServers({ mcpServers: [
    { name: 'a', status: 'connected', tools: [{}, {}] },
    { name: 'b', status: 'disabled' },
    { name: 'c' },
    { nope: 1 },
  ] });
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual([rows[0].statusText, rows[0].toolCount, rows[0].enabled], ['מחובר', 2, true]);
  assert.strictEqual(rows[1].enabled, false);
  assert.strictEqual(rows[2].status, 'pending');
  assert.deepStrictEqual(normalizeServers(null), []);
});
