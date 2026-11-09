// Pure: what one conversation has shown in the webview, kept in memory so the view can be
// redrawn when the user switches back to it (one view hosts several conversations, only one is
// visible). Streamed pieces are folded into their block so a replay paints each block once.
// No vscode, no I/O; nothing here is persisted.
//
// Kinds of host -> webview messages:
//   base      `sessionLoaded` (a resumed transcript): replaces everything before it.
//   thread    `events` and the thread nodes below, kept in order.
//   snapshot  the last one of each type is enough (bars, pickers, meter).
//   other     not kept (notices, menus, search results, focus...).

const THREAD_TYPES = new Set(['planReady', 'selfTurn', 'errorCard']);
const SNAPSHOT_TYPES = new Set(['mode', 'model', 'models', 'context', 'commands', 'backgroundTasks', 'claudeTasks', 'loopJobs', 'changesCard']);

function createReplayLog() {
  return {
    base: null,          // the last sessionLoaded message
    items: [],           // [{ev}] or [{msg}] in order
    blocks: new Map(),   // block key -> index in items (text and thinking)
    tools: new Map(),    // tool id -> index in items
    snapshots: new Map(), // type -> last message
    agents: new Map(),   // agent card id -> last card (the host sends only changed cards)
  };
}

function addEvent(log, ev) {
  if (ev.kind === 'delta') {
    const at = log.blocks.get(ev.key);
    if (at === undefined) {
      log.blocks.set(ev.key, log.items.length);
      log.items.push({ ev: { ...ev } });
    } else {
      const prev = log.items[at].ev;
      // A final block already holds the whole text; late pieces add nothing.
      if (prev.kind === 'delta') prev.text = (prev.text || '') + (ev.text || '');
    }
    return;
  }
  if (ev.kind === 'block') {
    const at = log.blocks.get(ev.key);
    if (at === undefined) {
      log.blocks.set(ev.key, log.items.length);
      log.items.push({ ev });
    } else {
      log.items[at] = { ev };
    }
    return;
  }
  if (ev.kind === 'tool' && ev.id) {
    const at = log.tools.get(ev.id);
    if (at === undefined) {
      log.tools.set(ev.id, log.items.length);
      log.items.push({ ev });
    } else if (ev.final || !log.items[at].ev.final) {
      log.items[at] = { ev };
    }
    return;
  }
  if (ev.kind === 'status') return; // only the live spinner word
  log.items.push({ ev });
}

function record(log, msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'sessionLoaded') {
    log.base = msg;
    log.items = [];
    log.blocks.clear();
    log.tools.clear();
    log.agents.clear();
    return;
  }
  if (msg.type === 'events') {
    for (const ev of msg.events || []) addEvent(log, ev);
  } else if (THREAD_TYPES.has(msg.type)) {
    log.items.push({ msg });
  } else if (SNAPSHOT_TYPES.has(msg.type)) {
    log.snapshots.set(msg.type, msg);
  } else if (msg.type === 'agentCards') {
    for (const card of msg.cards || []) log.agents.set(card.id, card);
  }
}

// The user's own message: the webview draws it locally when sent, so it is only recorded.
function addUser(log, text) {
  log.items.push({ ev: { kind: 'user', text } });
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

module.exports = { createReplayLog, record, addUser, replay, sentTexts };
