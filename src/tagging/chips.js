// File tagging (package K, PLAN.md section 10): the pure model of the two chips above the box and the
// one function that turns them into text for the CLI. No vscode dependency, so it is unit-tested
// directly. One channel only: a file reaches the CLI as `@/abs/path` (or `@/abs/path#5-10`) in the
// message, because the CLI does not expand `@` in stream-json mode (DECISIONS.md 2026-11-05).
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

// The paths a prompt already mentions (`@path`, `@"path"`, `@path#5-10`), as keys.
function mentionedKeys(text) {
  const keys = new Set();
  const re = /(^|\s)@(?:"([^"\n]+)"|([^\s"@]+))/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const raw = (m[2] || m[3]).replace(/[.,;:!?)\]}]+$/, '').replace(/#\d+(-\d+)?$/, '');
    keys.add(pathKey(raw));
  }
  return keys;
}

// The single function that puts the chips in front of a message. `shown` from view(), `ctx` the
// editor context (for the selected text), `last` {file, sel}: the keys last handed to the model.
// Each part is sent once per change. A file the message text already mentions (the `@` menu,
// Alt+K) is not repeated: the same file is sent once. Returns {text, last}.
function withContext(text, shown, ctx, last = {}) {
  const parts = [];
  const next = { ...last };
  if (shown.file && pathKey(shown.file.path) !== last.file) {
    if (!mentionedKeys(text).has(pathKey(shown.file.path))) {
      parts.push(`[הקשר מהעורך] ${shown.file.isDir ? 'התיקייה' : 'הקובץ'}: ${mentionText(shown.file.path)}`);
    }
    next.file = pathKey(shown.file.path);
  }
  if (shown.lines && ctx && selKey(ctx) !== last.sel) {
    let body = ctx.selText || '';
    if (body.length > SELECTION_MAX_CHARS) body = `${body.slice(0, SELECTION_MAX_CHARS)}\n… (קוצר)`;
    parts.push(`[הקשר מהעורך] השורות שנבחרו: ${linesMention(ctx)}\n\`\`\`\n${body}\n\`\`\``);
    next.sel = selKey(ctx);
  }
  if (!parts.length) return { text, last: next };
  return { text: `${parts.join('\n')}\n\n${text}`, last: next };
}

module.exports = { view, withContext, linesMention, mentionedKeys, pathKey, selKey, baseName, SELECTION_MAX_CHARS };
