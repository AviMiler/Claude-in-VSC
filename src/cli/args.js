// The CLI argument list for one long-lived stream-json conversation process.

const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions'];

// allowBypass: the CLI only accepts a later switch to bypassPermissions when the process was
// started with --allow-dangerously-skip-permissions (checked against CLI 2.1.181).
// settings: an object passed as compact JSON to --settings (src/models/launch.js). Node quotes it
// for claude-bin.exe; the .cmd/.bat route doubles the quotes (spawn.js quoteForCmd).
function buildArgs({ permissionMode = 'default', resume, model, allowBypass = false, settings } = {}) {
  const mode = PERMISSION_MODES.includes(permissionMode) ? permissionMode : 'default';
  const args = [
    '-p',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--permission-prompt-tool', 'stdio',
    '--permission-mode', mode,
  ];
  if (allowBypass) args.push('--allow-dangerously-skip-permissions');
  if (resume) args.push('--resume', resume);
  if (model) args.push('--model', model);
  if (settings) args.push('--settings', JSON.stringify(settings));
  return args;
}

module.exports = { buildArgs, PERMISSION_MODES };
