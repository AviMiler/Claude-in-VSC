// Starts the CLI executable. On Windows a bare name is resolved on PATH x PATHEXT,
// and .cmd/.bat files go through cmd.exe because Node cannot spawn them directly.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENTRYPOINT = 'claude-local-vscode';

function resolveExecutable(command, env = process.env, platform = process.platform) {
  if (path.isAbsolute(command) || command.includes('/') || command.includes('\\')) return command;
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = platform === 'win32'
    ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of platform === 'win32' && path.extname(command) ? [''] : exts) {
      const candidate = path.join(dir, command + ext.toLowerCase());
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return command;
}

function quoteForCmd(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

// The exact call as it is run: resolved executable, arguments (quoted where they contain spaces),
// working directory. Values after `-e` (`mcp add -e KEY=VALUE`) are masked; the environment is never logged.
function describeCall(exe, args, cwd) {
  const shown = [];
  for (let i = 0; i < args.length; i++) {
    let a = String(args[i]);
    if (i > 0 && args[i - 1] === '-e') {
      const eq = a.indexOf('=');
      a = eq > 0 ? `${a.slice(0, eq)}=***` : '***';
    }
    shown.push(/[\s"]/.test(a) || a === '' ? `"${a.replace(/"/g, '\\"')}"` : a);
  }
  return `${[exe, ...shown].join(' ')} (cwd ${cwd || process.cwd()})`;
}

// log(text, tag, level) is optional; it receives the exact call before the process starts.
function spawnCli(claudePath, args, { cwd, env = process.env, log } = {}) {
  const exe = resolveExecutable(claudePath, env);
  const childEnv = { ...env, CLAUDE_CODE_ENTRYPOINT: ENTRYPOINT };
  const options = { cwd, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true };
  if (log) log(`call ${describeCall(exe, args, cwd)}`, 'spawn', 'info');
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe)) {
    const line = [exe, ...args].map(quoteForCmd).join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
      ...options,
      windowsVerbatimArguments: true,
    });
  }
  return spawn(exe, args, options);
}

module.exports = { spawnCli, resolveExecutable, describeCall, ENTRYPOINT };
