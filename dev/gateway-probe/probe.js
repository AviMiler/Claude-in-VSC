// Gateway probe core (plain Node, no dependencies). Used by extension.js and runnable alone:
//   node probe.js [--url http://172.27.5.5:11436] [--key ollama] [--model qwen3.8:27b] [--out result.json]
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

const MAX_BODY = 200000;

function viaHttp(urlStr, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let u;
    try { u = new URL(urlStr); } catch (e) { return resolve({ ok: false, error: 'bad url: ' + urlStr, ms: 0 }); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, ms: Date.now() - t0, text: text.slice(0, MAX_BODY), bytes: text.length, contentType: res.headers['content-type'] });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout after ' + timeoutMs + ' ms')));
    req.on('error', (e) => resolve({ ok: false, error: [e && e.code, e && e.message].filter(Boolean).join(' '), ms: Date.now() - t0 }));
    if (body) req.write(body);
    req.end();
  });
}

async function viaFetch(urlStr, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  if (typeof fetch !== 'function') return { ok: false, error: 'global fetch is not available', ms: 0 };
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(urlStr, { method, headers, body, signal: ac.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, text: text.slice(0, MAX_BODY), bytes: text.length, contentType: res.headers.get('content-type') };
  } catch (e) {
    return { ok: false, error: [e && e.name, e && e.message, e && e.cause && (e.cause.code || e.cause.message)].filter(Boolean).join(' '), ms: Date.now() - t0 };
  } finally { clearTimeout(timer); }
}

function summarize(name, text) {
  let json;
  try { json = JSON.parse(text); } catch { return { note: 'not JSON', head: String(text).slice(0, 200) }; }
  const out = { topKeys: json && typeof json === 'object' ? Object.keys(json).slice(0, 12) : typeof json };
  const arr = Array.isArray(json) ? json : (Array.isArray(json && json.data) ? json.data : null);
  if (arr && typeof arr[0] === 'string') {
    out.count = arr.length;
    out.values = arr.slice(0, 60);
  } else if (arr) {
    out.count = arr.length;
    const first = arr[0] || {};
    out.firstItemKeys = Object.keys(first).slice(0, 20);
    if (first.model_info) out.firstItemModelInfoKeys = Object.keys(first.model_info).slice(0, 40);
    out.items = arr.map((m) => {
      const mi = m.model_info || m;
      const pick = {};
      for (const k of ['id', 'model_name', 'model_group', 'max_input_tokens', 'max_tokens', 'supports_vision', 'supports_function_calling', 'supports_reasoning', 'supports_tool_choice', 'context_window']) {
        if (m[k] !== undefined) pick[k] = m[k];
        else if (mi && mi[k] !== undefined) pick[k] = mi[k];
      }
      return pick;
    }).slice(0, 40);
  } else if (json && typeof json === 'object') {
    out.sample = JSON.stringify(json).slice(0, 400);
  }
  return out;
}

function maskProxy(v) { return String(v || '').replace(/\/\/[^@\/]+@/, '//***@'); }

async function runProbe({ baseUrl, apiKey, model, timeoutMs = 15000, extra = {} }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const auth = { Authorization: 'Bearer ' + apiKey };
  const jsonHeaders = { ...auth, 'Content-Type': 'application/json' };
  const tcBody = JSON.stringify({ model, messages: [{ role: 'user', content: 'hello world' }] });
  const checks = [
    ['GET /v1/models (no key)', 'GET', '/v1/models', {}],
    ['GET /v1/models (key)', 'GET', '/v1/models', auth],
    ['GET /v1/model/info', 'GET', '/v1/model/info', auth],
    ['GET /model_group/info', 'GET', '/model_group/info', auth],
    ['GET /public/model_hub', 'GET', '/public/model_hub', {}],
    ['GET /utils/supported_openai_params', 'GET', '/utils/supported_openai_params?model=' + encodeURIComponent(model), auth],
    ['POST /utils/token_counter', 'POST', '/utils/token_counter', jsonHeaders, tcBody],
    ['GET /routes', 'GET', '/routes', auth],
  ];
  const env = {
    node: process.version,
    electron: process.versions.electron || null,
    platform: process.platform + ' ' + os.release(),
    proxyEnv: Object.fromEntries(['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'].filter((k) => process.env[k]).map((k) => [k, maskProxy(process.env[k])])),
    ...extra,
  };
  const results = [];
  for (const [name, method, p, headers, body] of checks) {
    const url = base + p;
    const h = await viaHttp(url, { method, headers, body, timeoutMs });
    const entry = { name, url, http: { ok: h.ok, status: h.status, ms: h.ms, bytes: h.bytes, error: h.error, contentType: h.contentType } };
    if (h.text !== undefined) entry.summary = summarize(name, h.text);
    if (name === 'GET /v1/models (no key)') {
      const f = await viaFetch(url, { method, headers, body, timeoutMs });
      entry.fetch = { ok: f.ok, status: f.status, ms: f.ms, bytes: f.bytes, error: f.error };
    }
    if (h.text !== undefined) entry.body = h.text;
    results.push(entry);
  }
  return { baseUrl: base, model, when: new Date().toISOString(), env, results };
}

function formatReport(r, includeBodies = false) {
  const lines = [];
  lines.push('Gateway probe ' + r.when + '  ' + r.baseUrl + '  model=' + r.model);
  lines.push('env: ' + JSON.stringify(r.env));
  for (const e of r.results) {
    const h = e.http;
    lines.push('');
    lines.push((h.ok ? 'OK   ' : 'FAIL ') + e.name + '  ->  ' + (h.status || h.error) + '  (' + h.ms + ' ms, ' + (h.bytes || 0) + ' bytes)');
    if (e.fetch) lines.push('     fetch: ' + (e.fetch.ok ? 'OK ' : 'FAIL ') + (e.fetch.status || e.fetch.error) + ' (' + e.fetch.ms + ' ms)');
    if (e.summary) lines.push('     ' + JSON.stringify(e.summary).slice(0, includeBodies ? 6000 : 1500));
  }
  return lines.join('\n');
}

module.exports = { runProbe, formatReport };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
  runProbe({ baseUrl: opt('url', 'http://172.27.5.5:11436'), apiKey: opt('key', 'ollama'), model: opt('model', 'qwen3.8:27b') }).then((r) => {
    const out = path.resolve(opt('out', 'gateway-probe-result.json'));
    fs.writeFileSync(out, JSON.stringify(r, null, 2));
    console.log(formatReport(r));
    console.log('\nFull result written to ' + out);
  });
}
