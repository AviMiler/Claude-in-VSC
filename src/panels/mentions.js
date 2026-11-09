// @-mention completion for files and folders. Lists the workspace through `git ls-files` (which
// honours every .gitignore) when `respectGitIgnore` is on, else by walking the folder. Read-only,
// in memory; no vscode dependency so the ranking is unit-tested directly.
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const MAX_FILES = 20000;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

function toSlashes(p) {
  return p.split(path.sep).join('/');
}

// "src/a/b.js" -> ["src/", "src/a/"]
function foldersOf(files) {
  const set = new Set();
  for (const f of files) {
    const parts = f.split('/');
    for (let i = 1; i < parts.length; i++) set.add(`${parts.slice(0, i).join('/')}/`);
  }
  return [...set];
}

// Basename prefix first, then basename contains, then path contains. Folders and files mixed;
// shorter paths first inside a rank.
function rankPaths(entries, query, max = 30, cwd = '') {
  const q = String(query || '').toLowerCase();
  const scored = [];
  // A query ending in "/" is a folder being entered: show only its direct children.
  const inside = q.endsWith('/') ? q : null;
  for (const entry of entries) {
    if (inside) {
      const lowerEntry = entry.toLowerCase();
      if (lowerEntry === inside || !lowerEntry.startsWith(inside) || lowerEntry.slice(inside.length).replace(/\/$/, '').includes('/')) continue;
      scored.push({ entry, rank: 0 });
      continue;
    }
    const lower = entry.toLowerCase();
    const base = lower.replace(/\/$/, '').split('/').pop();
    let rank;
    if (!q) rank = 0;
    else if (base.startsWith(q)) rank = 0;
    else if (base.includes(q)) rank = 1;
    else if (lower.includes(q)) rank = 2;
    else continue;
    scored.push({ entry, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.entry.length - b.entry.length || a.entry.localeCompare(b.entry));
  return scored.slice(0, max).map((s) => ({ path: s.entry, isDir: s.entry.endsWith('/'), abs: absPath(cwd, s.entry) }));
}

// Absolute path with "/" of a workspace-relative entry; the CLI is told this path, because it
// does not expand "@relative" itself in stream-json mode (F-4). Empty when the cwd is unknown.
function absPath(cwd, rel) {
  if (!cwd) return rel;
  return `${toSlashes(cwd).replace(/\/$/, '')}/${rel}`;
}

// A query typed after picking a folder carries the absolute path: bring it back to relative.
function relativeQuery(cwd, query) {
  const base = `${toSlashes(cwd || '').replace(/\/$/, '')}/`;
  const q = String(query || '');
  return cwd && q.toLowerCase().startsWith(base.toLowerCase()) ? q.slice(base.length) : q;
}

function parseGitList(stdout) {
  return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
}

function gitFiles(cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', ['ls-files', '-co', '--exclude-standard'], { cwd, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(parseGitList(stdout).slice(0, MAX_FILES));
    });
  });
}

function walkFiles(cwd) {
  const out = [];
  const stack = [''];
  while (stack.length && out.length < MAX_FILES) {
    const rel = stack.pop();
    let dirents;
    try {
      dirents = fs.readdirSync(path.join(cwd, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      const child = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) stack.push(child);
      } else if (d.isFile()) {
        out.push(toSlashes(child));
      }
    }
  }
  return out;
}

// Files + folders of the workspace, relative with "/" (folders end with "/").
async function listEntries(cwd, respectGitIgnore) {
  let files = null;
  if (respectGitIgnore) {
    try {
      files = await gitFiles(cwd);
    } catch {
      files = null; // not a git repo (or no git): fall back to the walk
    }
  }
  if (!files) files = walkFiles(cwd);
  return files.concat(foldersOf(files));
}

// The text inserted for a mention: a path with spaces is quoted, so the model sees one token.
function mentionText(relPath) {
  return /\s/.test(relPath) ? `@"${relPath}"` : `@${relPath}`;
}

// Rewrites the `@rel/path` mentions of a prompt that name an existing file or folder under `cwd`
// into absolute paths: the CLI does not expand `@path` in stream-json mode, and a model given a
// bare relative path guessed a wrong location (CHANGELOG F-4). Unknown names are left untouched.
function resolveMentions(text, cwd) {
  if (!text || !cwd || !text.includes('@')) return text;
  const inCwd = (rel) => {
    const abs = path.resolve(cwd, rel);
    const inside = path.relative(cwd, abs);
    return !inside.startsWith('..' + path.sep) && inside !== '..' && !path.isAbsolute(inside) && fs.existsSync(abs) ? abs : null;
  };
  return text.replace(/(^|\s)@(?:"([^"\n]+)"|([^\s"@]+))/g, (whole, lead, quoted, bare) => {
    let abs = inCwd(quoted || bare);
    let tail = '';
    if (!abs && bare) { // "@a.js," / "(@a.js)": retry without the trailing punctuation
      const m = /[.,;:!?)\]}]+$/.exec(bare);
      if (m) {
        abs = inCwd(bare.slice(0, m.index));
        tail = m[0];
      }
    }
    return abs ? `${lead}${mentionText(abs)}${tail}` : whole;
  });
}

module.exports = { resolveMentions, foldersOf, rankPaths, parseGitList, listEntries, mentionText, toSlashes, absPath, relativeQuery };
