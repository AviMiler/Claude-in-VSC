// Fixed tag per feature for the "Claude Code Local" log. Add a tag here before using it.
const TAGS = Object.freeze({
  GENERAL: 'general',
  SPAWN: 'spawn',
  STREAM: 'stream',
  PERMISSION: 'permission',
  QUEUE: 'queue',
  HISTORY: 'history',
  SESSION: 'session',
  MCP: 'mcp',
  URI: 'uri',
  ERROR_CARD: 'error-card',
  MODEL_SWITCH: 'model-switch',
  CONTEXT: 'context',
  CHECKPOINT: 'checkpoint',
  DIFF: 'diff',
  TASKS: 'tasks',
  BACKGROUND: 'background',
  AGENTS: 'agents',
  LOOP: 'loop',
  DISPLAY: 'display',
  SETTINGS: 'settings',
  CONTROL: 'control',
  DROP: 'drop',
  BTW: 'btw',
});

// Tags the webview may log under (via the `log` message).
const WEBVIEW_TAGS = Object.freeze([TAGS.QUEUE, TAGS.DISPLAY, TAGS.MCP, TAGS.SESSION, TAGS.DIFF, TAGS.CHECKPOINT, TAGS.HISTORY, TAGS.DROP]);

module.exports = { TAGS, WEBVIEW_TAGS };
