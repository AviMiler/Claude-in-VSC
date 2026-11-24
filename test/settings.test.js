// src/util/settings.js read(): the user's own context window comes from VS Code's inspect(), not from get().
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const config = { values: {}, inspect: undefined };
const vscodeStub = {
  workspace: {
    getConfiguration: () => ({
      get: (name) => config.values[name],
      ...(config.inspect ? { inspect: config.inspect } : {}),
    }),
    onDidChangeConfiguration: () => ({ dispose() {} }),
  },
};
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode-stub' : resolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };
const { createSettings } = require('../src/util/settings');

const DEFAULTS = { API_TIMEOUT_MS: '1200000', CLAUDE_CODE_MAX_CONTEXT_TOKENS: '64000' };

test('explicitWindow is the user value from inspect(), whatever get() returns (the merged object)', () => {
  config.values = { environmentVariables: { ...DEFAULTS, CLAUDE_CODE_MAX_CONTEXT_TOKENS: '48000' } };
  config.inspect = (key) => (key === 'environmentVariables' ? { defaultValue: DEFAULTS, globalValue: { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '48000' } } : undefined);
  const s = createSettings();
  assert.strictEqual(s.get().explicitWindow, 48000);
  s.dispose();
});

test('explicitWindow is null when only the package default (or a copy of it) is set', () => {
  config.values = { environmentVariables: DEFAULTS };
  config.inspect = () => ({ defaultValue: DEFAULTS });
  assert.strictEqual(createSettings().get().explicitWindow, null);
  config.inspect = () => ({ defaultValue: DEFAULTS, workspaceValue: { ...DEFAULTS, API_TIMEOUT_MS: '5' } });
  assert.strictEqual(createSettings().get().explicitWindow, null, '64000 copied along by VS Code is not a choice');
});

test('explicitWindow is null when the configuration object has no inspect()', () => {
  config.values = { environmentVariables: DEFAULTS };
  config.inspect = undefined;
  assert.strictEqual(createSettings().get().explicitWindow, null);
});
