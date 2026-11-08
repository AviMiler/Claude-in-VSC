// The IDE lock file `<claude config dir>/ide/<port>.lock`: the CLI finds IDEs by reading these
// (verified in CLI 2.1.246). The one file the extension writes, an explicit exception to "the
// extension writes no files" (DECISIONS.md 2026-11-08). Deleted on dispose; stale ones (pid dead
// AND port refusing) are cleaned on start. Other live IDEs' locks are never touched. No vscode.
const fs = require('fs');
const net = require('net');
const path = require('path');
const { claudeConfigDir } = require('../util/paths');

const PORT_PROBE_MS = 800;

function lockDir(env = process.env) {
  return path.join(claudeConfigDir(env), 'ide');
}

// The JSON the CLI parses (field set verified from a real lock of the official extension).
function lockContent({ pid, workspaceFolders, ideName, authToken, platform = process.platform }) {
  return { pid, workspaceFolders, ideName, transport: 'ws', runningInWindows: platform === 'win32', authToken };
}

// Writes the lock; returns its path. Mode 0600: on POSIX only the user can read it; on Windows
// mode bits do nothing beyond read-only, so privacy comes from the per-user ACL of the profile folder.
function writeLock(dir, port, content) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${port}.lock`);
  fs.writeFileSync(file, JSON.stringify(content), { mode: 0o600 });
  return file;
}

// Deletes our lock only if it still names our pid (synchronous: also called on process exit).
function removeLock(file, pid = process.pid) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && data.pid === pid) {
      fs.unlinkSync(file);
      return true;
    }
  } catch {}
  return false;
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists, owned by someone else
  }
}

// True only when the port actively refuses (ECONNREFUSED); a timeout counts as "maybe in use".
function portRefuses(port, host = '127.0.0.1', timeoutMs = PORT_PROBE_MS) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const end = (refused) => { sock.destroy(); resolve(refused); };
    sock.setTimeout(timeoutMs, () => end(false));
    sock.once('connect', () => end(false));
    sock.once('error', (err) => end(err.code === 'ECONNREFUSED'));
  });
}

// Deletes `<port>.lock` files whose pid is dead AND whose port refuses. Unreadable files are left
// (the CLI deletes those itself). Returns the deleted file names. `checks` is injectable for tests.
async function cleanStaleLocks(dir, { isPidAlive = pidAlive, isPortRefusing = portRefuses } = {}) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => /^\d+\.lock$/.test(n));
  } catch {
    return [];
  }
  const removed = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!data || isPidAlive(data.pid)) continue;
    if (!(await isPortRefusing(Number(name.slice(0, -5))))) continue;
    try {
      fs.unlinkSync(file);
      removed.push(name);
    } catch {}
  }
  return removed;
}

module.exports = { lockDir, lockContent, writeLock, removeLock, cleanStaleLocks, pidAlive, portRefuses };
