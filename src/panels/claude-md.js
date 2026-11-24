// The "open the project CLAUDE.md" menu item (Q-8). Pure apart from the functions it is given, so it is
// testable without VS Code. The file is the CLI's own project memory; this only opens or creates it.
const path = require('path');

const FILE = 'CLAUDE.md';
// Written when the user agrees to create the file. English: the model reads this file.
const TEMPLATE = '# CLAUDE.md\n\nProject notes for Claude Code: how to build and test, conventions, things to avoid.\n';

// deps: { exists(p), write(p, text), open(p), ask() -> Promise<boolean>, notice(text) }
async function openProjectClaudeMd(cwd, noFolder, deps) {
  if (noFolder || !cwd) return deps.notice('אין תיקיית פרויקט פתוחה, לכן אין CLAUDE.md לפתוח.');
  const file = path.join(cwd, FILE);
  if (deps.exists(file)) return deps.open(file);
  if (!(await deps.ask())) return undefined;
  try {
    deps.write(file, TEMPLATE);
  } catch (err) {
    return deps.notice(`יצירת CLAUDE.md נכשלה: ${err.message}`);
  }
  return deps.open(file);
}

module.exports = { openProjectClaudeMd, TEMPLATE, FILE };
