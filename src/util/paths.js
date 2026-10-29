// Locations the CLI owns. The extension only reads them.
const os = require('os');
const path = require('path');

function claudeConfigDir(env = process.env) {
  return env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// The CLI names a project's transcript folder by replacing every non-alphanumeric character
// of the cwd with '-' (checked on this machine: "C:\AI projects\X" -> "C--AI-projects-X").
function encodeCwd(cwd) {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

function projectDir(cwd, env = process.env) {
  return path.join(claudeConfigDir(env), 'projects', encodeCwd(cwd));
}

module.exports = { claudeConfigDir, encodeCwd, projectDir };
