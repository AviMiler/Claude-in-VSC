// Read-only access to the CLI's own transcripts: ~/.claude/projects/<encoded cwd>/<sessionId>.jsonl.
// The extension never writes, renames or deletes these files.
const fs = require('fs');
const path = require('path');
const { projectDir } = require('../util/paths');
const { userTextFromEntry } = require('../cli/content');

const HEAD_BYTES = 64 * 1024;
const TITLE_MAX = 60;
const ID_RE = /^[0-9a-f-]{36}$/i;

function readHead(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, n).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function parseLines(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a cut last line or a corrupt one */ }
  }
  return out;
}

function shorten(text) {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > TITLE_MAX ? `${one.slice(0, TITLE_MAX - 1)}…` : one;
}

// Title rule: the CLI's own custom title (set by /rename or the app) wins, then a `summary`
// line, then the first real user message. Titles may appear late in a file, so the tail is
// scanned too.
function titleOf(file, size) {
  const head = parseLines(readHead(file));
  let tailEntries = [];
  if (size > HEAD_BYTES) {
    const fd = fs.openSync(file, 'r');
    try {
      const len = Math.min(HEAD_BYTES, size);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      tailEntries = parseLines(buf.toString('utf8'));
    } finally {
      fs.closeSync(fd);
    }
  }
  const all = head.concat(tailEntries);
  const custom = [...all].reverse().find((e) => e.type === 'custom-title' && e.customTitle);
  if (custom) return shorten(custom.customTitle);
  const summary = all.find((e) => e.type === 'summary' && e.summary);
  if (summary) return shorten(summary.summary);
  for (const e of head) {
    if (e.type !== 'user' || e.isMeta || e.isSidechain) continue;
    const text = userTextFromEntry(e.message && e.message.content);
    if (text) return shorten(text);
  }
  return null;
}

function listSessions(cwd, env = process.env) {
  const dir = projectDir(cwd, env);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const items = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const id = name.slice(0, -'.jsonl'.length);
    if (!ID_RE.test(id)) continue;
    const file = path.join(dir, name);
    try {
      const stat = fs.statSync(file);
      const title = titleOf(file, stat.size);
      if (title) items.push({ id, title, mtime: stat.mtimeMs });
    } catch { /* unreadable file: skip */ }
  }
  return items.sort((a, b) => b.mtime - a.mtime);
}

function sessionFile(cwd, id, env) {
  if (!ID_RE.test(id)) throw new Error(`bad session id: ${id}`);
  return path.join(projectDir(cwd, env), `${id}.jsonl`);
}

function readSession(cwd, id, env = process.env) {
  return parseLines(fs.readFileSync(sessionFile(cwd, id, env), 'utf8'));
}

function sessionTitle(cwd, id, env = process.env) {
  const file = sessionFile(cwd, id, env);
  return titleOf(file, fs.statSync(file).size) || '';
}

module.exports = { listSessions, readSession, sessionTitle };
