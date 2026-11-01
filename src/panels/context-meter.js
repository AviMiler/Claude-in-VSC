// Context meter: how full the model's window is now (PLAN.md section 2, "Context meter").
// Source: the control request `get_context_usage` (DEPENDENCIES.md section 2 #16). Its `maxTokens`
// follows CLAUDE_CODE_MAX_CONTEXT_TOKENS in claudeLocal.environmentVariables (default 64000,
// unverified for qwen3.8:27b: see dev/check-context-window.txt).

const TIMEOUT_MS = 15000;

// Pure: the response to { used, max } or null when it does not carry both numbers.
function parseContextUsage(response) {
  const used = response && response.totalTokens;
  const max = response && response.maxTokens;
  return Number.isFinite(used) && Number.isFinite(max) && max > 0 ? { used, max } : null;
}

// Asks the CLI and posts { type: 'context', used, max } to the webview; failures are only logged.
function refreshContextMeter(conversation) {
  const proc = conversation.proc;
  if (!proc) return;
  proc.request('get_context_usage', {}, TIMEOUT_MS).then(
    (response) => {
      const usage = parseContextUsage(response);
      if (usage && proc === conversation.proc) {
        conversation.services.logger.info('context', `used=${usage.used} max=${usage.max}`);
        conversation.post({ type: 'context', ...usage });
      }
    },
    (err) => conversation.services.logger.warn('context', `get_context_usage failed: ${err.message}`),
  );
}

module.exports = { parseContextUsage, refreshContextMeter };
