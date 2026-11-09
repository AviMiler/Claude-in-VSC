// Pure: the session's file changes, collected from the `Edit` / `MultiEdit` / `Write` tool calls
// in the UI event stream (live or from a transcript). No git and no disk reads: a diff shows only
// the fragments the tool call carried (`old_string` -> `new_string`; a `Write` is empty -> content).

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);

function createEditLog() {
  return { byId: new Map() }; // tool_use id -> { path, fragments: [{ before, after }], write }
}

function fragmentsOf(name, input) {
  if (name === 'Write') return [{ before: '', after: String(input.content || '') }];
  if (name === 'MultiEdit') {
    return (Array.isArray(input.edits) ? input.edits : [])
      .map((e) => ({ before: String(e.old_string || ''), after: String(e.new_string || '') }));
  }
  return [{ before: String(input.old_string || ''), after: String(input.new_string || '') }];
}

// Records a final tool event; partial (streaming) events carry no input yet and are skipped.
function addEvent(log, ev) {
  if (!ev || ev.kind !== 'tool' || !ev.final || !EDIT_TOOLS.has(ev.name)) return false;
  const input = ev.input || {};
  if (typeof input.file_path !== 'string' || !input.file_path) return false;
  const fragments = fragmentsOf(ev.name, input);
  if (!fragments.length) return false;
  // write: the fragment is the whole file (change-stats.js compares it with the earlier content).
  log.byId.set(ev.id || `anon-${log.byId.size}`, { path: input.file_path, fragments, write: ev.name === 'Write' });
  return true;
}

// Changed files in first-change order, with the number of fragments each.
function listFiles(log) {
  const files = new Map();
  for (const { path, fragments } of log.byId.values()) {
    files.set(path, (files.get(path) || 0) + fragments.length);
  }
  return [...files].map(([path, count]) => ({ path, count }));
}

// Both sides of one file's diff: every fragment in order, under the same numbered separator on
// each side so the diff editor aligns them.
function fileDiff(log, path) {
  const left = [];
  const right = [];
  let n = 0;
  for (const entry of log.byId.values()) {
    if (entry.path !== path) continue;
    for (const { before, after } of entry.fragments) {
      n += 1;
      const sep = `──── שינוי ${n} ────`;
      left.push(sep, before);
      right.push(sep, after);
    }
  }
  return { left: left.join('\n'), right: right.join('\n'), count: n };
}

module.exports = { createEditLog, addEvent, listFiles, fileDiff, EDIT_TOOLS };
