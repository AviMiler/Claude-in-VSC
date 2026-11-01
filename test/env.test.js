const test = require('node:test');
const assert = require('node:assert');
const { mergeEnv, sanitizeEnvironmentVariables } = require('../src/cli/env');
const { terminalLaunch } = require('../src/cli/terminal');

test('sanitize keeps strings, stringifies numbers/booleans, drops invalid names and values', () => {
  assert.deepStrictEqual(
    sanitizeEnvironmentVariables({ A: '1', B: 2, C: true, 'D E': 'x', 'F=G': 'x', '': 'x', H: null, I: { a: 1 } }),
    { A: '1', B: '2', C: 'true' },
  );
  assert.deepStrictEqual(sanitizeEnvironmentVariables(undefined), {});
  assert.deepStrictEqual(sanitizeEnvironmentVariables(['a']), {});
});

test('mergeEnv: overrides win and the base is not mutated', () => {
  const base = { PATH: 'p', API_TIMEOUT_MS: '1' };
  const merged = mergeEnv(base, { API_TIMEOUT_MS: '1200000', NEW: 'x' }, 'linux');
  assert.deepStrictEqual(merged, { PATH: 'p', API_TIMEOUT_MS: '1200000', NEW: 'x' });
  assert.strictEqual(base.API_TIMEOUT_MS, '1');
});

test('mergeEnv: on Windows names match case-insensitively', () => {
  const merged = mergeEnv({ Path: 'old', Other: '1' }, { PATH: 'new' }, 'win32');
  assert.deepStrictEqual(merged, { Other: '1', PATH: 'new' });
  assert.deepStrictEqual(mergeEnv({ Path: 'old' }, { PATH: 'new' }, 'linux'), { Path: 'old', PATH: 'new' });
});

test('terminalLaunch: exe runs directly, cmd/bat through cmd.exe', () => {
  const env = { ComSpec: 'C:/Windows/System32/cmd.exe' };
  assert.deepStrictEqual(terminalLaunch('C:/x/claude-bin.exe', { env, platform: 'win32' }), { shellPath: 'C:/x/claude-bin.exe', shellArgs: [] });
  assert.deepStrictEqual(terminalLaunch('C:/x/claude.cmd', { env, platform: 'win32' }), {
    shellPath: 'C:/Windows/System32/cmd.exe',
    shellArgs: ['/d', '/c', 'C:/x/claude.cmd'],
  });
  assert.deepStrictEqual(terminalLaunch('/usr/bin/claude', { env: {}, platform: 'linux' }), { shellPath: '/usr/bin/claude', shellArgs: [] });
});
