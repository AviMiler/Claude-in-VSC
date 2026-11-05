// Context meter: how full the model's window is now (PLAN.md section 2, "Context meter").
// Source: the control request `get_context_usage` (DEPENDENCIES.md section 2 #16): `totalTokens`,
// `maxTokens`, `model`. The CLI's `maxTokens` follows CLAUDE_CODE_MAX_CONTEXT_TOKENS from
// claudeLocal.environmentVariables (default 64000; src/models/launch.js passes it with
// CLAUDE_CODE_DISABLE_1M_CONTEXT). The configured window is also a ceiling here, so a CLI that still
// assumes 1M for a "<model>[1m]" name (FIXES F-9) cannot make the meter show 1,000,000.
const { contextWindow } = require('../models/launch');

const TIMEOUT_MS = 15000;

// Pure: the response to { used, max, cliMax, model } or null when it does not carry both numbers.
// window: the configured window (a positive integer) or null.
function parseContextUsage(response, window = null) {
  const used = response && response.totalTokens;
  const cliMax = response && response.maxTokens;
  if (!(Number.isFinite(used) && Number.isFinite(cliMax) && cliMax > 0)) return null;
  const max = window && window < cliMax ? window : cliMax;
  return { used, max, cliMax, model: typeof response.model === 'string' ? response.model : '' };
}

// Asks the CLI and posts { type: 'context', used, max } to the webview; failures are only logged.
// The window is read from the settings now; a changed setting applies from the next process start,
// so the two can differ only until then.
function refreshContextMeter(conversation) {
  const proc = conversation.proc;
  if (!proc) return;
  proc.request('get_context_usage', {}, TIMEOUT_MS).then(
    (response) => {
      const window = contextWindow(conversation.services.settings.get().environmentVariables);
      const usage = parseContextUsage(response, window);
      if (usage && proc === conversation.proc) {
        const capped = usage.max !== usage.cliMax ? ` (CLI max=${usage.cliMax}, capped)` : '';
        conversation.services.logger.info('context', `used=${usage.used} max=${usage.max}${capped} model=${usage.model || '?'}`);
        conversation.post({ type: 'context', used: usage.used, max: usage.max });
      }
    },
    (err) => conversation.services.logger.warn('context', `get_context_usage failed: ${err.message}`),
  );
}

module.exports = { parseContextUsage, refreshContextMeter };
