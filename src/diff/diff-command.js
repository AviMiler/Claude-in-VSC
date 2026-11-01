// `/diff`: a QuickPick of the files this session changed; picking one opens the shared diff view
// with that file's tool-call fragments. Handled by the extension, never sent to the model.
const vscode = require('vscode');
const nodePath = require('path');
const { listFiles, fileDiff } = require('./edit-log');

// logger (optional): counts only under [diff], never file contents.
async function runDiffCommand(log, diffView, cwd, logger) {
  const files = listFiles(log);
  const info = (text) => logger && logger.info('diff', text);
  info(`files ${files.length}`);
  if (!files.length) return false;
  const items = files.map(({ path, count }) => ({
    label: nodePath.basename(path),
    description: nodePath.relative(cwd, path) || path,
    detail: count === 1 ? 'שינוי אחד' : `${count} שינויים`,
    path,
  }));
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'קבצים ש-Claude שינה בשיחה הזו (מקטעי השינוי בלבד, לא כל הקובץ)',
    matchOnDescription: true,
  });
  if (!pick) return true;
  info(`open diff (${pick.detail})`);
  const { left, right } = fileDiff(log, pick.path);
  await diffView.show({ left, right, filePath: pick.path, title: `${pick.label}: שינויי Claude` });
  return true;
}

module.exports = { runDiffCommand };
