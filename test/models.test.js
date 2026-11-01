// Pure model logic (package D): gateway address, gateway fetch, filter, launch env, context usage.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { resolveGatewayUrl, fetchModels } = require('../src/models/gateway');
const { filterModels, isNoToolsError } = require('../src/models/filter');
const { modelEnv } = require('../src/models/launch');
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

test('modelEnv points all three aliases at the chosen model; nothing for the default', () => {
  assert.deepStrictEqual(modelEnv('gpt-oss:20b'), {
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-oss:20b',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-oss:20b',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-oss:20b',
  });
  assert.deepStrictEqual(modelEnv('default'), {});
  assert.deepStrictEqual(modelEnv(undefined), {});
});

test('parseContextUsage needs both totalTokens and a positive maxTokens', () => {
  assert.deepStrictEqual(parseContextUsage({ totalTokens: 23400, maxTokens: 64000, categories: [] }), { used: 23400, max: 64000 });
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
