// Pure: the host -> webview message of the cumulative changes card ("שינויים בשיחה"): every file
// this session's Edit/MultiEdit/Write calls changed, with added/removed line counts. One message
// carries the whole list; the webview redraws the one card in place (a replay snapshot).
const nodePath = require('path');
const { fileStats } = require('./change-stats');

// rel: shown in the card; a file outside the folder keeps its full path.
function relPath(cwd, filePath) {
  if (!cwd) return filePath;
  const rel = nodePath.relative(cwd, filePath);
  return rel && !rel.startsWith('..') && !nodePath.isAbsolute(rel) ? rel : filePath;
}

function changesCardMessage(log, cwd) {
  const files = fileStats(log).map((f) => ({ ...f, rel: relPath(cwd, f.path) }));
  return { type: 'changesCard', files };
}

module.exports = { changesCardMessage, relPath };
