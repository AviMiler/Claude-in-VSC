// The environment of the CLI process: the VS Code environment, then the extension's own defaults
// (CLI_ENV_DEFAULTS), then claudeLocal.environmentVariables on top. Every CLI spawn goes through
// mergeEnv: the chat process, the /btw one-shot, the MCP commands and Open in Terminal.

// Set for every CLI spawn unless the user sets the same variable in claudeLocal.environmentVariables
// (any value, "0" included). CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 turns off telemetry, error
// reporting and update checks (the machine has no internet; the CLI logged export failures).
const CLI_ENV_DEFAULTS = { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };

// Keeps only usable entries: a non-empty name without "=" and a string/number/boolean value.
function sanitizeEnvironmentVariables(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (!name || name.includes('=') || /\s/.test(name)) continue;
    if (typeof value === 'string') out[name] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[name] = String(value);
  }
  return out;
}

// Windows variable names are case-insensitive, so an override replaces the existing spelling.
function applyEnv(base, overrides, platform) {
  const merged = { ...base };
  for (const [name, value] of Object.entries(overrides)) {
    if (platform === 'win32') {
      const existing = Object.keys(merged).find((k) => k.toLowerCase() === name.toLowerCase());
      if (existing) delete merged[existing];
    }
    merged[name] = value;
  }
  return merged;
}

// base (not mutated), then CLI_ENV_DEFAULTS (replacing a same-name variable of base), then the user's
// overrides, which win over both (on Windows also when spelled in another case).
function mergeEnv(base, overrides, platform = process.platform) {
  return applyEnv(applyEnv(base, CLI_ENV_DEFAULTS, platform), sanitizeEnvironmentVariables(overrides), platform);
}

module.exports = { mergeEnv, sanitizeEnvironmentVariables, CLI_ENV_DEFAULTS };
