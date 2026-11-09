// Pure: checkpoint support for the CLI process (DEPENDENCIES.md finding 23). File rewind works
// only when the process starts with CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1 and
// --replay-user-messages; the replayed user messages carry the `uuid` that `rewind_files` takes.

const { userTextFromEntry } = require('../cli/content');

const CHECKPOINT_ENV = { CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1' };
const PREVIEW_MAX = 80;

// Extra launch flags: always the replay flag; `--fork-session` (with --resume) gives a new
// session id with the same context (finding 10).
function checkpointArgs({ fork = false } = {}) {
  return fork ? ['--replay-user-messages', '--fork-session'] : ['--replay-user-messages'];
}

// A replayed user prompt: a top-level `user` line with a uuid that is not a tool result. The
// preview is what the user typed, without the editor-context blocks (content.js).
function checkpointFrom(msg) {
  if (!msg || msg.type !== 'user' || !msg.uuid || msg.parent_tool_use_id) return null;
  const content = msg.message && msg.message.content;
  if (typeof content !== 'string' && !Array.isArray(content)) return null;
  if (Array.isArray(content) && content.some((b) => b && b.type === 'tool_result')) return null;
  const text = userTextFromEntry(content);
  const preview = text.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_MAX);
  return { id: msg.uuid, preview, at: Date.now() };
}

function createCheckpointList() {
  return { items: [] }; // oldest first
}

function addCheckpoint(list, msg) {
  const cp = checkpointFrom(msg);
  if (!cp || list.items.some((c) => c.id === cp.id)) return null;
  list.items.push(cp);
  return cp;
}

// Number of files a `rewind_files` answer reports; null when the shape is not the known one.
function filesChangedCount(response) {
  const changed = response && response.filesChanged;
  if (Array.isArray(changed)) return changed.length;
  return Number.isInteger(changed) ? changed : null;
}

module.exports = { CHECKPOINT_ENV, checkpointArgs, checkpointFrom, createCheckpointList, addCheckpoint, filesChangedCount };
