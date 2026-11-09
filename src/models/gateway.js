// Reads the model list from the LiteLLM gateway (PLAN.md section 3, decision 1). In memory only;
// the only network the extension does. `/v1/models` gives the ids, `/v1/model/info` the per-model
// `litellm_params` used by the filter (DEPENDENCIES.md section 3.2).
const fs = require('fs');
const path = require('path');
const { claudeConfigDir } = require('../util/paths');

const TIMEOUT_MS = 5000;

// The CLI's own settings.json keeps the connection variables (spec.md "Settings").
function readCliSettingsEnv() {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(claudeConfigDir(), 'settings.json'), 'utf8'));
    return json && typeof json.env === 'object' && json.env ? json.env : {};
  } catch {
    return {};
  }
}

// Order: the explicit setting, the extension's environmentVariables, the process environment, the CLI's settings.json.
function resolveGatewayUrl({ gatewayUrl, environmentVariables = {}, env = process.env, cliEnv = readCliSettingsEnv() }) {
  const pick = (o) => (o && typeof o.ANTHROPIC_BASE_URL === 'string' ? o.ANTHROPIC_BASE_URL : '');
  const url = (gatewayUrl || pick(environmentVariables) || pick(env) || pick(cliEnv)).trim();
  return url.replace(/\/+$/, '');
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// Returns { ids, info }: info is the `/v1/model/info` list, or [] when that endpoint fails
// (the list still works, only the JSON-title filter is skipped).
async function fetchModels(baseUrl) {
  if (!baseUrl) throw new Error('no gateway address');
  const list = await getJson(`${baseUrl}/v1/models`);
  const ids = (Array.isArray(list && list.data) ? list.data : []).map((m) => m && m.id).filter((id) => typeof id === 'string');
  let info = [];
  try {
    const data = await getJson(`${baseUrl}/v1/model/info`);
    info = Array.isArray(data && data.data) ? data.data : [];
  } catch {}
  return { ids, info };
}

module.exports = { resolveGatewayUrl, fetchModels };
