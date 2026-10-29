// OutputChannel "Claude Code Local". Long payloads are cut so the log stays readable.
const vscode = require('vscode');

const MAX_LINE = 500;

function cut(text) {
  return text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}… (${text.length} chars)` : text;
}

function createLogger() {
  const channel = vscode.window.createOutputChannel('Claude Code Local', { log: true });
  return {
    info: (msg) => channel.info(msg),
    warn: (msg) => channel.warn(msg),
    error: (msg) => channel.error(msg),
    debug: (msg) => channel.debug(cut(msg)),
    show: () => channel.show(true),
    dispose: () => channel.dispose(),
  };
}

module.exports = { createLogger };
