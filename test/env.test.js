const test = require('node:test');
const assert = require('node:assert');
const { mergeEnv, sanitizeEnvironmentVariables } = require('../src/cli/env');

const OFF = 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC';
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
  assert.deepStrictEqual(merged, { PATH: 'p', API_TIMEOUT_MS: '1200000', NEW: 'x', [OFF]: '1' });
  assert.strictEqual(base.API_TIMEOUT_MS, '1');
});

test('mergeEnv: on Windows names match case-insensitively', () => {
  const merged = mergeEnv({ Path: 'old', Other: '1' }, { PATH: 'new' }, 'win32');
  assert.deepStrictEqual(merged, { Other: '1', PATH: 'new', [OFF]: '1' });
  assert.deepStrictEqual(mergeEnv({ Path: 'old' }, { PATH: 'new' }, 'linux'), { Path: 'old', PATH: 'new', [OFF]: '1' });
});

test('mergeEnv: every spawn gets the nonessential-traffic switch, also without any user variables', () => {
  assert.deepStrictEqual(mergeEnv({}, undefined, 'linux'), { [OFF]: '1' });
  assert.deepStrictEqual(mergeEnv({ PATH: 'p' }, {}, 'win32'), { PATH: 'p', [OFF]: '1' });
});

test('mergeEnv: a value the user set is kept, "0" included; our default replaces one from the process environment', () => {
  assert.strictEqual(mergeEnv({}, { [OFF]: '0' }, 'linux')[OFF], '0');
  assert.strictEqual(mergeEnv({}, { [OFF]: '' }, 'linux')[OFF], '', 'any value, an empty one too');
  assert.strictEqual(mergeEnv({}, { [OFF]: { a: 1 } }, 'linux')[OFF], '1', 'an unusable value is dropped by sanitize: the default applies');
  assert.strictEqual(mergeEnv({}, { [OFF]: 'yes' }, 'linux')[OFF], 'yes');
  assert.strictEqual(mergeEnv({ [OFF]: '0' }, {}, 'linux')[OFF], '1', 'the process environment does not count as the user\'s choice');
});

test('mergeEnv on Windows: the default replaces the process spelling, and a user spelling in any case wins', () => {
  assert.deepStrictEqual(mergeEnv({ claude_code_disable_nonessential_traffic: '0' }, {}, 'win32'), { [OFF]: '1' });
  assert.deepStrictEqual(mergeEnv({ claude_code_disable_nonessential_traffic: '1' }, { [OFF.toLowerCase()]: '0' }, 'win32'), { [OFF.toLowerCase()]: '0' });
  assert.deepStrictEqual(mergeEnv({}, { [OFF.toLowerCase()]: '0' }, 'linux'), { [OFF.toLowerCase()]: '0', [OFF]: '1' }, 'names are case-sensitive elsewhere');
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
