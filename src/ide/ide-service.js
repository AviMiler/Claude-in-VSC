// The IDE server as one object (no vscode, so it is testable): WebSocket server + MCP JSON-RPC +
// the lock file. One per extension host (window); every CLI process the window starts may connect.
const crypto = require('crypto');
const nodePath = require('path');
const { startWsServer, mask } = require('./ws-server');
const { createIdeRpc, selectionChanged } = require('./ide-rpc');
const lock = require('./ide-lock');

const LOG_PART = 450; // the log cuts lines at 500 characters
const CONNECT_WAIT_MS = 30000;

const samePath = (a, b) => nodePath.resolve(a).toLowerCase() === nodePath.resolve(b).toLowerCase();

// opts: { deps (tool functions), workspaceFolders() -> [fsPath], ideName, dir (lock folder),
//   log(text, level), verbose (log handshake headers and every JSON-RPC message, token masked) }
function createIdeService({ deps, workspaceFolders, ideName, dir, log = () => {}, verbose = false }) {
  const token = crypto.randomBytes(32).toString('hex');
  const isVerbose = typeof verbose === 'function' ? verbose : () => verbose;
  const clients = new Set();
  const connectWaiters = new Set();
  let server = null;
  let lockFile = null;
  let connections = 0;
  let lastSelection = null;
  const onExit = () => { if (lockFile) lock.removeLock(lockFile); };

  const logMessage = (dirn, text) => {
    if (!isVerbose()) return;
    const t = mask(text, token);
    const n = Math.max(1, Math.ceil(t.length / LOG_PART));
    for (let i = 0; i < n; i += 1) log(`${dirn} ${n > 1 ? `[${i + 1}/${n}] ` : ''}${t.slice(i * LOG_PART, (i + 1) * LOG_PART)}`);
  };
  const sendTo = (conn, obj) => {
    const text = JSON.stringify(obj);
    logMessage('>>', text);
    conn.send(text);
  };

  function onConnection(conn) {
    connections += 1;
    clients.add(conn);
    log(`client connected (${clients.size} open)`);
    for (const fn of connectWaiters) fn();
    const rpc = createIdeRpc({
      deps,
      log,
      onInitialized: () => { if (lastSelection) sendTo(conn, lastSelection); },
    });
    conn.onText = async (text) => {
      logMessage('<<', text);
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        log(`ignored non-JSON message (${text.length} chars)`, 'warn');
        return;
      }
      const replies = (await Promise.all((Array.isArray(msg) ? msg : [msg]).map(rpc))).filter(Boolean);
      for (const r of replies) sendTo(conn, r);
    };
    conn.onClose = () => {
      clients.delete(conn);
      log(`client disconnected (${clients.size} open)`);
    };
  }

  return {
    token,
    get port() { return server ? server.port : null; },
    get openClients() { return clients.size; },

    async start() {
      const removed = await lock.cleanStaleLocks(dir);
      if (removed.length) log(`removed stale locks: ${removed.join(', ')}`);
      server = await startWsServer({ token, onConnection, log, verbose: isVerbose });
      lockFile = lock.writeLock(dir, server.port, lock.lockContent({ pid: process.pid, workspaceFolders: workspaceFolders(), ideName, authToken: token }));
      process.on('exit', onExit);
      log(`listening on 127.0.0.1:${server.port}; lock ${lockFile} (folders ${JSON.stringify(workspaceFolders())})`);
      return server.port;
    },

    // The child env that makes the CLI connect: only when `cwd` is one of the lock's folders.
    envFor(cwd) {
      if (!server) { log('not listening yet: the CLI starts without the IDE server', 'warn'); return {}; }
      if (!workspaceFolders().some((f) => samePath(f, cwd))) {
        log(`cwd ${cwd} is not a workspace folder: the CLI starts without the IDE server`, 'warn');
        return {};
      }
      return { CLAUDE_CODE_SSE_PORT: String(server.port) };
    },

    // Calls onMissing() if no client connects within `ms`. Returns a function that cancels.
    watchConnection(onMissing, ms = CONNECT_WAIT_MS) {
      const startCount = connections;
      let timer = null;
      const waiter = () => { if (connections > startCount) cancel(); };
      function cancel() { clearTimeout(timer); connectWaiters.delete(waiter); }
      connectWaiters.add(waiter);
      timer = setTimeout(() => { cancel(); log(`no CLI connection within ${ms / 1000}s`, 'warn'); onMissing(); }, ms);
      return cancel;
    },

    // `sel` from ide-vscode.editorSelection; sent to every open client.
    notifySelection(sel) {
      if (!sel) return;
      lastSelection = selectionChanged(sel, sel.fileUrl);
      for (const c of clients) sendTo(c, lastSelection);
    },

    async stop() {
      process.removeListener('exit', onExit);
      if (lockFile) { lock.removeLock(lockFile); log(`lock removed ${lockFile}`); }
      lockFile = null;
      for (const c of clients) c.close(1001, 'going away');
      clients.clear();
      if (server) await server.close();
      server = null;
    },
  };
}

module.exports = { createIdeService, CONNECT_WAIT_MS };
