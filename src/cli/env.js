// The environment of the CLI process: the VS Code environment with claudeLocal.environmentVariables on top.

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
function mergeEnv(base, overrides, platform = process.platform) {
  const merged = { ...base };
  for (const [name, value] of Object.entries(sanitizeEnvironmentVariables(overrides))) {
    if (platform === 'win32') {
      const existing = Object.keys(merged).find((k) => k.toLowerCase() === name.toLowerCase());
      if (existing) delete merged[existing];
    }
    merged[name] = value;
  }
  return merged;
}

module.exports = { mergeEnv, sanitizeEnvironmentVariables };
