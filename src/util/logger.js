// OutputChannel "Claude Code Local" with a fixed tag per feature (log-tags.js) and an in-memory
// ring buffer behind "Copy Log". Calls: logger.info(tag, msg); a single argument logs under [general].
// Never pass message text, file contents, tokens or environment values: log counts, names and ids.
const vscode = require('vscode');
const { TAGS } = require('./log-tags');
const { formatLine, shouldLog, createBuffer } = require('./log-buffer');

function createLogger() {
  const channel = vscode.window.createOutputChannel('Claude Code Local');
  const buffer = createBuffer();

  function write(level, tag, msg) {
    const setting = vscode.workspace.getConfiguration('claudeLocal').get('logLevel');
    if (!shouldLog(level, setting)) return;
    const line = formatLine(new Date(), level, tag, msg);
    buffer.push(line);
    channel.appendLine(line);
  }
  const at = (level) => (tag, msg) => (msg === undefined ? write(level, TAGS.GENERAL, tag) : write(level, tag, msg));

  return {
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    debug: at('debug'),
    show: () => channel.show(true),
    text: () => buffer.text(),
    copy: async () => {
      await vscode.env.clipboard.writeText(buffer.text());
      return buffer.size();
    },
    dispose: () => channel.dispose(),
  };
}

module.exports = { createLogger };
