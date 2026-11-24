// Fixed English lines appended to the system prompt (initialize.appendSystemPrompt) that steer the model to the navigation tools.
const NAV_GUIDANCE =
  'Before reading a whole file, call documentSymbols, then readSymbol for the part you need. ' +
  'To find uses, use findReferences, goToDefinition or workspaceSymbols instead of Grep. ' +
  'After editing, call getDiagnostics for that file.';

// Payload of the `initialize` control request: the guidance only when the nav server started and the setting is on.
function initializePayload(navStarted, enabled) {
  return navStarted && enabled ? { appendSystemPrompt: NAV_GUIDANCE } : {};
}

module.exports = { NAV_GUIDANCE, initializePayload };
