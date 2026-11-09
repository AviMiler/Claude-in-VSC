// File tagging (package K, PLAN.md section 10): the pure model of the two chips above the box and the
// one function that turns them into context for the CLI. No vscode dependency, so it is unit-tested
// directly. One channel only: the chips reach the CLI as separate English text blocks in front of
// the user's text, in the official extension's format (`<ide_opened_file>`, `<ide_selection>`), with
// absolute paths because the CLI does not expand `@` in stream-json mode (DECISIONS.md 2026-11-05).
// Everything the extension itself sends to the model is English; only the user's own text is not.
const { mentionText, toSlashes } = require('../panels/mentions');

const SELECTION_MAX_CHARS = 8000;

// A path as a comparison key: "/" separators, no trailing "/", lower case (Windows paths are
// case-insensitive; a false match on a case-sensitive disk only skips one duplicate line).
function pathKey(p) {
  return p ? toSlashes(String(p)).replace(/\/+$/, '').toLowerCase() : null;
}

const baseName = (p) => toSlashes(String(p)).replace(/\/+$/, '').split('/').pop();
const selKey = (ctx) => (ctx && ctx.lines ? `${pathKey(ctx.path)}#${ctx.lines.start}-${ctx.lines.end}` : null);

// `@path#5-10` (or `#5` for one line): Alt+K's text and the lines block's mention.
function linesMention(ctx) {
  if (!ctx.lines) return mentionText(ctx.path);
  const { start, end } = ctx.lines;
  return mentionText(`${ctx.path}#${start === end ? start : `${start}-${end}`}`);
}

// What the chips show.
// `ctx`: the editor context (editor-context.describe) or null. `flags` {attachOpenFile, attachSelection}.
// `st`: the conversation's chip state {manual: {path, isDir} | null, reverted, dismissed: {file, sel}}.
// `isOutside(path)`: whether a path is outside the workspace folders.
// Returns {file, lines}; null means the chip is shown empty.
function view(ctx, flags, st = {}, isOutside = () => false) {
  const dismissed = st.dismissed || {};
  let file = null;
  if (st.manual) {
    file = { path: st.manual.path, name: baseName(st.manual.path), isDir: Boolean(st.manual.isDir), manual: true };
  } else if (ctx && flags.attachOpenFile && dismissed.file !== pathKey(ctx.path)) {
    file = { path: ctx.path, name: ctx.name || baseName(ctx.path), isDir: false, manual: false };
  }
  if (file) file.outside = Boolean(isOutside(file.path));
  // The lines chip is automatic only, and only for a selection in the file the file chip holds.
  let lines = null;
  if (ctx && ctx.lines && flags.attachSelection && file && !file.isDir
    && pathKey(file.path) === pathKey(ctx.path) && dismissed.sel !== selKey(ctx)) {
    lines = { start: ctx.lines.start, end: ctx.lines.end, name: ctx.name || baseName(ctx.path) };
  }
  return { file, lines, reverted: Boolean(st.reverted) && !st.manual };
}

// A removed chip returns when the file or the selection changes (PLAN.md section 10): drops the
// removal marks that no longer match the editor context `ctx`. Mutates `st.dismissed`.
function pruneDismissed(st, ctx) {
  const d = st && st.dismissed;
  if (!d) return;
  if (d.file && d.file !== (ctx ? pathKey(ctx.path) : null)) delete d.file;
  if (d.sel && d.sel !== selKey(ctx)) delete d.sel;
}

// The CLI command a message is (`/compact`, `/plugin:cmd args`), lower case, or null. A command
// goes to the CLI as typed: text in front of it would turn it into a plain prompt. A path such as
// `/src/a.js` is not a command.
function commandName(text) {
  const m = /^\/([A-Za-z][\w:-]*)(?:\s|$)/.exec(String(text || '').trimStart());
  return m ? m[1].toLowerCase() : null;
}

// The paths a prompt already mentions (`@path`, `@"path"`, `@path#5-10`), as keys. Like the `@`
// menu (trigger-token.js), a mention may follow whitespace or `( [ { " '`.
function mentionedKeys(text) {
  const keys = new Set();
  const re = /(^|[\s([{"'])@(?:"([^"\n]+)"|([^\s"@]+))/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = (m[2] || m[3]).replace(/[.,;:!?)\]}']+$/, '').replace(/#\d+(-\d+)?$/, '');
    keys.add(pathKey(raw));
  }
  return keys;
}

const NOT_RELATED = 'This may or may not be related to the current task.';

// The context blocks, in the official extension's wording (observed in its log).
function openedFileBlock(file) {
  const what = file.isDir ? 'selected the folder' : 'opened the file';
  return `<ide_opened_file>The user ${what} ${file.path} in the IDE. ${NOT_RELATED}</ide_opened_file>`;
}

function selectionBlock(ctx) {
  let body = ctx.selText || '';
  if (body.length > SELECTION_MAX_CHARS) body = `${body.slice(0, SELECTION_MAX_CHARS)}\n... (truncated)`;
  const { start, end } = ctx.lines;
  return `<ide_selection>The user selected the lines ${start} to ${end} from ${ctx.path}:\n${body}\n\n${NOT_RELATED}</ide_selection>`;
}

// The single function that turns the chips into context for a message. `shown` from view(), `ctx`
// the editor context (for the selected text), `last` {file, sel}: the keys last handed to the model.
// Each part is sent once per change. A file the message text already mentions (the `@` menu,
// Alt+K) is not repeated: the same file is sent once. Returns {text, context, last}: `text` is the
// user's text unchanged, `context` the English blocks that go in front of it as separate text
// content blocks (CliProcess.sendUserText), so the user's own message stays exactly as typed.
// Like the official extension, a new selection is sent ALONE: its block names the file, so no
// `<ide_opened_file>` goes with it (the file counts as sent).
function withContext(text, shown, ctx, last = {}) {
  const context = [];
  const next = { ...last };
  const newSel = Boolean(shown.lines && ctx && ctx.lines && selKey(ctx) !== last.sel);
  if (shown.file && pathKey(shown.file.path) !== last.file) {
    if (!newSel && !mentionedKeys(text).has(pathKey(shown.file.path))) context.push(openedFileBlock(shown.file));
    next.file = pathKey(shown.file.path);
  }
  if (newSel) {
    context.push(selectionBlock(ctx));
    next.sel = selKey(ctx);
  }
  return { text, context, last: next };
}

module.exports = {
  view, withContext, pruneDismissed, commandName, linesMention, mentionedKeys, pathKey, selKey, baseName, SELECTION_MAX_CHARS, NOT_RELATED,
};
