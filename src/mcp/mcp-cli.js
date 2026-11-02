// Runs `claude mcp ...` (add/remove) with the same executable and environment as the chat process.
const { spawnCli } = require('../cli/spawn');

const TIMEOUT_MS = 60000;
const OUTPUT_MAX = 2000;

function runClaude(claudePath, args, { cwd, env, log }) {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let timer = null;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ...result, output: out.trim().slice(-OUTPUT_MAX) });
    };
    let child;
    try {
      child = spawnCli(claudePath, args, { cwd, env, log });
    } catch (err) {
      out = err.message;
      return finish({ ok: false });
    }
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, timedOut: true });
    }, TIMEOUT_MS);
    for (const s of [child.stdout, child.stderr]) {
      s.setEncoding('utf8');
      s.on('data', (d) => { out += d; });
    }
    child.stdin.on('error', () => {});
    child.stdin.end();
    child.on('error', (err) => { out += err.message; finish({ ok: false }); });
    child.on('exit', (code) => finish({ ok: code === 0 }));
  });
}

module.exports = { runClaude };
