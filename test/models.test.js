// Pure model logic (package D): gateway address, gateway fetch, filter, launch env, context usage.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { resolveGatewayUrl, fetchModels } = require('../src/models/gateway');
const { filterModels, isNoToolsError } = require('../src/models/filter');
const { launchSettings, contextWindow, explicitWindowFromInspect, pickLaunchWindow, FALLBACK_WINDOW } = require('../src/models/launch');
const { parseContextUsage } = require('../src/panels/context-meter');

// The shape of LiteLLM's /v1/model/info as recorded in DEPENDENCIES.md section 3.3.
const INFO = [
  { model_name: 'qwen3.8:27b', litellm_params: { extra_body: { num_ctx: 12288, output_config: { effort: 'high' } } } },
  { model_name: 'gemma4:31b', litellm_params: { extra_body: { output_config: { format: { type: 'json_schema' } } } } },
  { model_name: 'qwen2.5-coder:7b', litellm_params: { extra_body: { output_config: { format: { type: 'json_schema' } } } } },
];

test('resolveGatewayUrl: setting, then environmentVariables, then env, then the CLI settings.json', () => {
  const base = { environmentVariables: {}, env: {}, cliEnv: {} };
  assert.strictEqual(resolveGatewayUrl({ ...base, gatewayUrl: 'http://a:1/', cliEnv: { ANTHROPIC_BASE_URL: 'http://d' } }), 'http://a:1');
  assert.strictEqual(resolveGatewayUrl({ ...base, environmentVariables: { ANTHROPIC_BASE_URL: 'http://b' }, env: { ANTHROPIC_BASE_URL: 'http://c' } }), 'http://b');
  assert.strictEqual(resolveGatewayUrl({ ...base, env: { ANTHROPIC_BASE_URL: 'http://c' } }), 'http://c');
  assert.strictEqual(resolveGatewayUrl({ ...base, cliEnv: { ANTHROPIC_BASE_URL: 'http://d//' } }), 'http://d');
  assert.strictEqual(resolveGatewayUrl(base), '');
});

test('filterModels hides forced-JSON models and the denylist, keeps order, drops duplicates', () => {
  const ids = ['qwen3.8:27b', 'gemma4:31b', 'gemma3:27b', 'qwen2.5-coder:7b', 'gpt-oss:20b', 'qwen3.8:27b'];
  assert.deepStrictEqual(filterModels(ids, INFO, ['gemma3:27b']), ['qwen3.8:27b', 'gpt-oss:20b']);
  assert.deepStrictEqual(filterModels(['a'], undefined, undefined), ['a']);
});

test('isNoToolsError matches the gateway error text only', () => {
  assert.ok(isNoToolsError('API Error: 400 litellm.BadRequestError: gemma3:27b does not support tools'));
  assert.ok(!isNoToolsError('Invalid model name passed'));
  assert.ok(!isNoToolsError(undefined));
});

test('launchSettings points every alias at the chosen model, and always carries the window (F-8)', () => {
  assert.deepStrictEqual(launchSettings({ model: 'gpt-oss:20b', window: 32768 }), {
    env: {
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '32768',
      CLAUDE_CODE_DISABLE_1M_CONTEXT: '1',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-oss:20b',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-oss:20b',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-oss:20b',
      ANTHROPIC_SMALL_FAST_MODEL: 'gpt-oss:20b',
    },
  });
});

test('launchSettings sets the window and turns 1M off for the default model too; without a window it is the fallback (F-9)', () => {
  assert.deepStrictEqual(launchSettings({ model: 'default', window: 48000 }), {
    env: { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '48000', CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' },
  });
  assert.deepStrictEqual(launchSettings({ model: 'default' }), {
    env: { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '64000', CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' },
  });
  const both = launchSettings({ model: 'qwen2.5:7b', window: 32768 }).env;
  assert.strictEqual(both.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'qwen2.5:7b');
  assert.strictEqual(both.CLAUDE_CODE_DISABLE_1M_CONTEXT, '1');
});

test('explicitWindowFromInspect: the first scope that sets a window wins; the package default alone is not explicit', () => {
  const win = (n) => ({ API_TIMEOUT_MS: '1', CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(n) });
  assert.strictEqual(explicitWindowFromInspect({ defaultValue: win(48000) }), null, 'defaultValue is never read');
  assert.strictEqual(explicitWindowFromInspect({ globalValue: win(64000) }), null, '64000 is the default copied along');
  assert.strictEqual(explicitWindowFromInspect({ globalValue: win(48000) }), 48000);
  assert.strictEqual(explicitWindowFromInspect({ globalValue: win(60000), workspaceValue: win(50000), workspaceFolderValue: win(40000) }), 40000);
  assert.strictEqual(explicitWindowFromInspect({ globalValue: win(60000), workspaceValue: win(50000) }), 50000);
  assert.strictEqual(explicitWindowFromInspect({ workspaceValue: win(64000), globalValue: win(48000) }), 48000, 'a copied default does not hide a real value below it');
  assert.strictEqual(explicitWindowFromInspect({ globalValue: { API_TIMEOUT_MS: '1' } }), null);
  assert.strictEqual(explicitWindowFromInspect({ globalValue: win('abc') }), null);
  assert.strictEqual(explicitWindowFromInspect(undefined), null);
});

test('pickLaunchWindow: the explicit value, else the last real window, else 64,000', () => {
  assert.deepStrictEqual(pickLaunchWindow({ explicit: 48000, real: 32000 }), { window: 48000, source: 'explicit', real: 32000 });
  assert.deepStrictEqual(pickLaunchWindow({ explicit: null, real: 32768 }), { window: 32768, source: 'cached', real: 32768 });
  assert.deepStrictEqual(pickLaunchWindow({ explicit: null, real: null }), { window: 64000, source: 'fallback', real: null });
  assert.deepStrictEqual(pickLaunchWindow({}), { window: FALLBACK_WINDOW, source: 'fallback', real: null });
});

test('contextWindow accepts only a positive integer', () => {
  assert.strictEqual(contextWindow({ CLAUDE_CODE_MAX_CONTEXT_TOKENS: '64000' }), 64000);
  assert.strictEqual(contextWindow({ CLAUDE_CODE_MAX_CONTEXT_TOKENS: 32000 }), 32000);
  for (const bad of ['', '0', '-5', '6.5', 'abc', null]) {
    assert.strictEqual(contextWindow({ CLAUDE_CODE_MAX_CONTEXT_TOKENS: bad }), null, String(bad));
  }
  assert.strictEqual(contextWindow({}), null);
  assert.strictEqual(contextWindow(undefined), null);
});

test('parseContextUsage: the known window is the maximum, whatever the CLI says; without one the CLI value (F-9)', () => {
  const r = { totalTokens: 3575, maxTokens: 1000000, model: 'qwen3.8:27b[1m]' };
  assert.deepStrictEqual(parseContextUsage(r, 64000), { used: 3575, max: 64000, cliMax: 1000000, model: 'qwen3.8:27b[1m]' });
  assert.strictEqual(parseContextUsage(r, null).max, 1000000);
  assert.strictEqual(parseContextUsage({ totalTokens: 1, maxTokens: 32000 }, 64000).max, 64000, 'a real window above the CLI value is shown too');
});

test('parseContextUsage needs both totalTokens and a positive maxTokens', () => {
  assert.deepStrictEqual(parseContextUsage({ totalTokens: 23400, maxTokens: 64000, categories: [] }), { used: 23400, max: 64000, cliMax: 64000, model: '' });
  assert.strictEqual(parseContextUsage({ totalTokens: 1 }), null);
  assert.strictEqual(parseContextUsage({ totalTokens: 1, maxTokens: 0 }), null);
  assert.strictEqual(parseContextUsage(null), null);
});

function gatewayServer(routes) {
  const server = http.createServer((req, res) => {
    const body = routes[req.url];
    res.writeHead(body ? 200 : 404, { 'content-type': 'application/json' });
    res.end(body ? JSON.stringify(body) : '{}');
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

test('fetchModels reads /v1/models and /v1/model/info; info failure still returns the ids', async () => {
  const server = await gatewayServer({ '/v1/models': { data: [{ id: 'qwen3.8:27b' }, { id: 'gemma4:31b' }] }, '/v1/model/info': { data: INFO } });
  const noInfo = await gatewayServer({ '/v1/models': { data: [{ id: 'x' }] } });
  try {
    const { ids, info } = await fetchModels(`http://127.0.0.1:${server.address().port}`);
    assert.deepStrictEqual(ids, ['qwen3.8:27b', 'gemma4:31b']);
    assert.strictEqual(info.length, 3);
    const partial = await fetchModels(`http://127.0.0.1:${noInfo.address().port}`);
    assert.deepStrictEqual(partial, { ids: ['x'], info: [] });
    await assert.rejects(fetchModels(''), /no gateway address/);
  } finally {
    server.close();
    noInfo.close();
  }
});

test('isNoVisionError matches image-support errors only', () => {
  const { isNoVisionError } = require('../src/models/filter');
  assert.ok(isNoVisionError('500: this model is missing data required for image input'));
  assert.ok(isNoVisionError('model does not support vision'));
  assert.ok(!isNoVisionError('API Error: 400 gemma3:27b does not support tools'));
  assert.ok(!isNoVisionError(''));
  assert.ok(!isNoVisionError('Error in revision 3 of the provision step')); // "vision" only as a whole word
});
