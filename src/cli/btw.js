// `/btw`: a side question answered by a separate short-lived CLI process that has no tools
// and no conversation history. One process per question; nothing is persisted.

const { spawnCli } = require('./spawn');

const BTW_TIMEOUT_MS = 180000;

// `--tools ""` disables every tool; `--no-session-persistence` keeps the question out of the
// CLI's history; no `--resume`, so the main conversation's context is never loaded.
// The question itself goes through stdin (no shell quoting or length limits).
function buildBtwArgs({ model, settings } = {}) {
  const args = ['-p', '--output-format', 'json', '--tools', '', '--no-session-persistence'];
  if (model) args.push('--model', model);
  if (settings) args.push('--settings', JSON.stringify(settings));
  return args;
}

// The `--output-format json` stdout: one object {type:'result', is_error, result}.
function parseBtwOutput(stdout) {
  let obj;
  try {
    obj = JSON.parse(String(stdout).trim());
  } catch {
    return { error: 'התשובה מה-CLI אינה בפורמט צפוי.' };
  }
  if (Array.isArray(obj)) obj = obj.find((o) => o && o.type === 'result') || {};
  if (obj.is_error) return { error: String(obj.result || 'שגיאה מה-CLI.') };
  const text = String(obj.result || '').trim();
  return text ? { text } : { error: 'לא התקבלה תשובה.' };
}

// Returns { promise, cancel }. The promise resolves { text } or { error }; it never rejects.
function runBtw({ claudePath, question, cwd, env, model, settings, timeoutMs = BTW_TIMEOUT_MS }) {
  let child;
  const promise = new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    let timer;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    try {
      child = spawnCli(claudePath, buildBtwArgs({ model, settings }), { cwd, env });
    } catch (e) {
      return finish({ error: `לא ניתן להפעיל את Claude (${e.code || e.message}).` });
    }
    timer = setTimeout(() => { child.kill(); finish({ error: 'השאלה לקחה יותר מדי זמן ובוטלה.' }); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish({ error: `לא ניתן להפעיל את Claude (${e.code || e.message}).` }));
    child.on('close', (code) => {
      const r = parseBtwOutput(out);
      finish(r.error && code !== 0 && !out.trim() ? { error: err.trim().slice(0, 300) || 'התהליך הסתיים בשגיאה.' } : r);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(question);
  });
  return { promise, cancel: () => child && child.kill() };
}

module.exports = { buildBtwArgs, parseBtwOutput, runBtw };
