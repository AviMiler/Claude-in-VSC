// What the CLI is started with for the chosen model and the context window, as the
// `env` of a `--settings <json>` flag. Environment variables of the CLI process are not enough:
// the CLI applies the `env` of every settings source over its own process environment, in the
// order user < project < local < flag (--settings) < managed, so ~/.claude/settings.json beat
// them (CHANGELOG F-8; DEPENDENCIES.md section 2 #28, #39, #40). Pure.

const DEFAULT_MODEL = 'default';
const WINDOW_VAR = 'CLAUDE_CODE_MAX_CONTEXT_TOKENS';
// Used when neither a user value nor the model's real window is known. It is also the package.json
// default of claudeLocal.environmentVariables, so a user value equal to it is not an explicit choice.
const FALLBACK_WINDOW = 64000;

// The CLI calls the small/fast ("haiku") model for session titles, ANTHROPIC_SMALL_FAST_MODEL
// first; every alias points at the chosen model or the server loads a second model.
const MODEL_VARS = [
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
];

// The window in an environmentVariables object as a positive integer, or null when unset.
function contextWindow(environmentVariables) {
  const raw = environmentVariables && environmentVariables[WINDOW_VAR];
  const n = Number(raw);
  return raw !== undefined && raw !== null && raw !== '' && Number.isInteger(n) && n > 0 ? n : null;
}

// The user's own window, from VS Code's `inspect('claudeLocal.environmentVariables')`: the folder, then
// the workspace, then the user value (never `defaultValue`). VS Code replaces the whole object when a
// scope sets it, so the package.json default's 64000 is copied along into scopes that only changed
// another variable; 64000 is therefore not counted as an explicit choice. null when there is none.
function explicitWindowFromInspect(inspected) {
  for (const scope of ['workspaceFolderValue', 'workspaceValue', 'globalValue']) {
    const n = contextWindow(inspected && inspected[scope]);
    if (n && n !== FALLBACK_WINDOW) return n;
  }
  return null;
}

// Pure: the window the CLI is started with and where it came from. explicit: the user's value or
// null; real: the model's last known real window (Ollama's /api/ps, from the in-memory cache) or null.
// source: 'explicit' | 'cached' | 'fallback'; real is passed through for the "differs" notices.
function pickLaunchWindow({ explicit = null, real = null } = {}) {
  if (explicit) return { window: explicit, source: 'explicit', real };
  if (real) return { window: real, source: 'cached', real };
  return { window: FALLBACK_WINDOW, source: 'fallback', real: null };
}

// The settings object for `--settings`. The window is always set: the CLI must not assume 1M, its
// default model resolves to "<model>[1m]" (CHANGELOG F-9), which wins over
// CLAUDE_CODE_MAX_CONTEXT_TOKENS unless CLAUDE_CODE_DISABLE_1M_CONTEXT is set.
function launchSettings({ model, window = FALLBACK_WINDOW } = {}) {
  const env = {};
  if (model && model !== DEFAULT_MODEL) {
    for (const name of MODEL_VARS) env[name] = model;
  }
  env[WINDOW_VAR] = String(window);
  env.CLAUDE_CODE_DISABLE_1M_CONTEXT = '1';
  return { env };
}

module.exports = {
  launchSettings, contextWindow, explicitWindowFromInspect, pickLaunchWindow, FALLBACK_WINDOW, DEFAULT_MODEL, MODEL_VARS,
};
