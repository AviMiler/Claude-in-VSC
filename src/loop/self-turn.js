// Pure: does this CLI line open a turn the user did not start? A `/loop` job (and possibly a
// finished background task) makes the CLI run a turn by itself; probe4 saw `system/init` and a
// `result` with no user message, but the exact sequence was never captured (DEPENDENCIES.md row
// 38). So, defensively: top-level model output (a message_start stream event or an assistant
// line) while no turn is open counts as a self-started turn. `system/init` alone does not, since
// it is not known whether the CLI also sends it outside a turn.
function startsSelfTurn(msg, busy) {
  if (busy || !msg || msg.parent_tool_use_id) return false;
  if (msg.type === 'assistant') return Boolean(msg.message) && msg.message.model !== '<synthetic>';
  return msg.type === 'stream_event' && Boolean(msg.event) && msg.event.type === 'message_start';
}

module.exports = { startsSelfTurn };
