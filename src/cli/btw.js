// `/btw`: a side question answered by a separate short-lived CLI process that has no tools
// and no conversation history. One process per question. The extension persists nothing; the CLI still
// writes a session file per call, so the process runs in a neutral temp folder (see btwCwd).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnCli } = require('./spawn');

// A cold model load measured 175-285 s, so the limit matches API_TIMEOUT_MS (20 minutes).
const BTW_TIMEOUT_MS = 1200000;

// The CLI 2.1.246 writes a session file for every -p call even with --no-session-persistence
// (measured by the user, dev/check-btw.txt). The files are keyed by the process's cwd, so /btw runs
// in a neutral temp folder: they land in a project the extension's history list never shows,
// and the project's CLAUDE.md and settings are not loaded. /btw has no tools, so it loses nothing.
function btwCwd() {
  const dir = path.join(os.tmpdir(), 'claude-local-btw');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* spawn then fails with a clear error */ }
  return dir;
}

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

// A side conversation has no CLI session (each call is a separate process with no history), so a
// follow-up carries the earlier turns of THIS side conversation in its stdin text. Kept in memory by
// the side panel only. The tool-less hint stops the model from announcing tool calls it cannot make.
const HISTORY_CHAR_LIMIT = 24000;
const NO_TOOLS_HINT = 'This is a side question: you have no tools here (no file access, no commands). Answer from your own knowledge and from what the user writes below, in the language of the question.';

function buildBtwPrompt(history, question) {
  const turns = [];
  let size = 0;
  for (let i = (history || []).length - 1; i >= 0; i--) {
    const t = `User: ${history[i].q}\nAssistant: ${history[i].a}`;
    if (turns.length && size + t.length > HISTORY_CHAR_LIMIT) break; // drop the oldest turns first
    turns.unshift(t);
    size += t.length;
  }
  const prior = turns.length ? `The conversation so far:\n\n${turns.join('\n\n')}\n\n` : '';
  return `${NO_TOOLS_HINT}\n\n${prior}${turns.length ? 'New message from the user:\n' : ''}${question}`;
}

// Returns { promise, cancel }. The promise resolves { text } or { error }; it never rejects.
function runBtw({ claudePath, question, cwd = btwCwd(), env, model, settings, timeoutMs = BTW_TIMEOUT_MS }) {
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

module.exports = { buildBtwPrompt, buildBtwArgs, parseBtwOutput, runBtw, btwCwd, BTW_TIMEOUT_MS };
