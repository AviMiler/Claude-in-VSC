// The exact-call log line for every CLI process (src/cli/spawn.js).
const test = require('node:test');
const assert = require('node:assert');
const { describeCall } = require('../src/cli/spawn');

test('describeCall shows the executable, every argument and the working directory', () => {
  const line = describeCall('/usr/bin/claude', ['-p', '--model', 'opus', '--resume', 'abc'], '/work');
  assert.strictEqual(line, '/usr/bin/claude -p --model opus --resume abc (cwd /work)');
});

test('describeCall quotes arguments that contain spaces or are empty', () => {
  const line = describeCall('claude', ['mcp', 'add', 'my server', '', 'say "hi"'], '/w');
  assert.strictEqual(line, 'claude mcp add "my server" "" "say \\"hi\\"" (cwd /w)');
});

test('describeCall masks the value of -e (env) but keeps the key', () => {
  const line = describeCall('claude', ['mcp', 'add', '-s', 'user', '-e', 'API_TOKEN=secret123', 'srv', '--', 'npx'], '/w');
  assert.ok(!line.includes('secret123'));
  assert.ok(line.includes('-e API_TOKEN=***'));
  assert.strictEqual(describeCall('claude', ['-e', 'NOVALUE'], '/w'), 'claude -e *** (cwd /w)');
});
