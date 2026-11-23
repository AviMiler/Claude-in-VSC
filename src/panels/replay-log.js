// Pure: what one conversation has shown in the webview, kept in memory so the view can be
// redrawn when the user switches back to it (one view hosts several conversations, only one is
// visible). Streamed pieces are folded into their block so a replay paints each block once.
// No vscode, no I/O; nothing here is persisted. The list is capped (items and approximate
// characters): the oldest finished items are dropped and the index maps are rebuilt, while an
// item that is still receiving updates (a streaming block, a running tool) is never dropped.
//
// Kinds of host -> webview messages:
//   base      `sessionLoaded` (a resumed transcript): replaces everything before it.
//   thread    `events` and the thread nodes below, kept in order.
//   snapshot  the last one of each type is enough (bars, pickers, meter).
//   other     not kept (notices, menus, search results, focus...).

const { isInjectedText } = require('../cli/content');

const THREAD_TYPES = new Set(['planReady', 'selfTurn', 'errorCard']);
const SNAPSHOT_TYPES = new Set(['mode', 'model', 'models', 'context', 'commands', 'backgroundTasks', 'claudeTasks', 'loopJobs', 'changesCard']);

// The cap. Past either limit the oldest finished items go, down to TRIM_TARGET of the limit (so
// the O(n) trim runs once per many additions, not on every one).
const MAX_ITEMS = 2000;
const MAX_CHARS = 2000000; // approximate: serialized length of the kept items
const TRIM_TARGET = 0.9;

function createReplayLog() {
  return {
    base: null,          // the last sessionLoaded message
    items: [],           // [{ev}] or [{msg}] in order
    chars: 0,            // approximate size of items, for the cap
    blocks: new Map(),   // block key -> index in items (text and thinking)
    tools: new Map(),    // tool id -> index in items
    snapshots: new Map(), // type -> last message
    agents: new Map(),   // agent card id -> last card (the host sends only changed cards)
  };
}

// Approximate size of one item in characters. (item) -> number
function sizeOf(item) {
  try { return JSON.stringify(item).length; } catch { return 0; }
}

// Appends an item, registers it under a key in an index map (optional), then applies the cap.
// Registering comes first so the trim remaps the new index too. (log, item, map?, key?) -> void
function push(log, item, map, key) {
  log.items.push(item);
  log.chars += sizeOf(item);
  if (map) map.set(key, log.items.length - 1);
  trim(log);
}

// Replaces the item at an index, keeping the size count right. (log, index, item) -> void
function replaceAt(log, at, item) {
  log.chars += sizeOf(item) - sizeOf(log.items[at]);
  log.items[at] = item;
}

// True while an item can still change: a streaming block or a running tool. (item) -> boolean
function isLive(item) {
  return !!item.ev && (item.ev.kind === 'delta' || (item.ev.kind === 'tool' && !item.ev.final));
}

// Drops the oldest finished items when over the cap, then rebuilds the index maps from the
// surviving positions (keys of dropped items are forgotten). (log) -> void
function trim(log) {
  if (log.items.length <= MAX_ITEMS && log.chars <= MAX_CHARS) return;
  const maxItems = Math.floor(MAX_ITEMS * TRIM_TARGET);
  const maxChars = Math.floor(MAX_CHARS * TRIM_TARGET);
  let count = log.items.length;
  let chars = log.chars;
  const keep = [];
  const newIndex = new Map(); // old index -> new index
  log.items.forEach((item, i) => {
    if ((count > maxItems || chars > maxChars) && !isLive(item)) {
      count--;
      chars -= sizeOf(item);
      return;
    }
    newIndex.set(i, keep.length);
    keep.push(item);
  });
  log.items = keep;
  log.chars = chars;
  for (const map of [log.blocks, log.tools]) {
    for (const [key, i] of [...map]) {
      if (newIndex.has(i)) map.set(key, newIndex.get(i));
      else map.delete(key);
    }
  }
}

function addEvent(log, ev) {
  // Injected context (editor blocks, CLI reminders) is never a visible item, live or restored.
  if ((ev.kind === 'block' || ev.kind === 'delta') && ev.blockType === 'text' && isInjectedText(ev.text || '')) return;
  if (ev.kind === 'delta') {
    const at = log.blocks.get(ev.key);
    if (at === undefined) {
      push(log, { ev: { ...ev } }, log.blocks, ev.key);
    } else {
      const prev = log.items[at].ev;
      // A final block already holds the whole text; late pieces add nothing.
      if (prev.kind === 'delta') {
        prev.text = (prev.text || '') + (ev.text || '');
        log.chars += (ev.text || '').length;
      }
    }
    return;
  }
  if (ev.kind === 'block') {
    const at = log.blocks.get(ev.key);
    if (at === undefined) {
      push(log, { ev }, log.blocks, ev.key);
    } else {
      replaceAt(log, at, { ev });
    }
    return;
  }
  if (ev.kind === 'tool' && ev.id) {
    const at = log.tools.get(ev.id);
    if (at === undefined) {
      push(log, { ev }, log.tools, ev.id);
    } else if (ev.final || !log.items[at].ev.final) {
      replaceAt(log, at, { ev });
    }
    return;
  }
  if (ev.kind === 'status') return; // only the live spinner word
  push(log, { ev });
}

function record(log, msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'sessionLoaded') {
    log.base = msg;
    log.items = [];
    log.chars = 0;
    log.blocks.clear();
    log.tools.clear();
    log.agents.clear();
    return;
  }
  if (msg.type === 'events') {
    for (const ev of msg.events || []) addEvent(log, ev);
  } else if (THREAD_TYPES.has(msg.type)) {
    push(log, { msg });
  } else if (SNAPSHOT_TYPES.has(msg.type)) {
    log.snapshots.set(msg.type, msg);
  } else if (msg.type === 'agentCards') {
    for (const card of msg.cards || []) log.agents.set(card.id, card);
  }
}

// The user's own message: the webview draws it locally when sent, so it is only recorded.
function addUser(log, text) {
  push(log, { ev: { kind: 'user', text } });
}

// Everything the webview needs to redraw this conversation, in paint order.
function replay(log) {
  const snapshots = [...log.snapshots.values()];
  if (log.agents.size) snapshots.push({ type: 'agentCards', cards: [...log.agents.values()] });
  return { base: log.base, items: log.items.slice(), snapshots };
}

// The texts the user sent, oldest first (for the up-arrow history after a switch).
function sentTexts(log) {
  const fromBase = log.base ? (log.base.events || []).filter((e) => e.kind === 'user').map((e) => e.text) : [];
  return fromBase.concat(log.items.filter((i) => i.ev && i.ev.kind === 'user').map((i) => i.ev.text));
}

module.exports = { MAX_ITEMS, MAX_CHARS, TRIM_TARGET, createReplayLog, record, addUser, replay, sentTexts };
