// What the CLI is started with for the chosen model and the configured context window, as the
// `env` of a `--settings <json>` flag. Environment variables of the CLI process are not enough:
// the CLI applies the `env` of every settings source over its own process environment, in the
// order user < project < local < flag (--settings) < managed, so ~/.claude/settings.json beat
// them (FIXES F-8; DEPENDENCIES.md section 2 #28, #39, #40). Pure.

const DEFAULT_MODEL = 'default';
const WINDOW_VAR = 'CLAUDE_CODE_MAX_CONTEXT_TOKENS';

// The CLI calls the small/fast ("haiku") model for session titles, ANTHROPIC_SMALL_FAST_MODEL
// first; every alias points at the chosen model or the server loads a second model.
const MODEL_VARS = [
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
];

// The window from claudeLocal.environmentVariables as a positive integer, or null when unset.
function contextWindow(environmentVariables) {
  const raw = environmentVariables && environmentVariables[WINDOW_VAR];
  const n = Number(raw);
  return raw !== undefined && raw !== null && raw !== '' && Number.isInteger(n) && n > 0 ? n : null;
}

// The settings object for `--settings`, or null when there is nothing to override.
// With a configured window the CLI must not assume 1M: its default model resolves to
// "<model>[1m]" (FIXES F-9), which wins over CLAUDE_CODE_MAX_CONTEXT_TOKENS unless
// CLAUDE_CODE_DISABLE_1M_CONTEXT is set.
function launchSettings({ model, environmentVariables } = {}) {
  const env = {};
  if (model && model !== DEFAULT_MODEL) {
    for (const name of MODEL_VARS) env[name] = model;
  }
  const window = contextWindow(environmentVariables);
  if (window) {
    env[WINDOW_VAR] = String(window);
    env.CLAUDE_CODE_DISABLE_1M_CONTEXT = '1';
  }
  return Object.keys(env).length ? { env } : null;
}

module.exports = { launchSettings, contextWindow, DEFAULT_MODEL, MODEL_VARS };
