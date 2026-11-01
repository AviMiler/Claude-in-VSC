// How to start the CLI's own interface in a VS Code terminal.
const path = require('path');
const { resolveExecutable } = require('./spawn');

// .cmd/.bat files cannot be a terminal's shellPath on Windows, so they run through cmd.exe.
function terminalLaunch(claudePath, { env = process.env, platform = process.platform } = {}) {
  const exe = resolveExecutable(claudePath, env, platform);
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(path.extname(exe))) {
    return { shellPath: env.ComSpec || 'cmd.exe', shellArgs: ['/d', '/c', exe] };
  }
  return { shellPath: exe, shellArgs: [] };
}

module.exports = { terminalLaunch };
