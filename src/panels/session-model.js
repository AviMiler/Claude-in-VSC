// Pure logic for the sessions list and the tab markers. No vscode, no I/O.
// Status of a listed session: "waiting" = an open conversation waits for a permission answer,
// "active" = an open conversation is working, "finished" = everything else.

const FILTERS = ['all', 'active', 'waiting', 'finished'];
const MARK_WAITING = '🔵';
const MARK_FINISHED = '🟠';
const CLOSED_MAX = 10;

function statusOf(open) {
  if (open && open.waiting) return 'waiting';
  if (open && open.busy) return 'active';
  return 'finished';
}

// items: [{id, title, mtime}] from transcripts.listSessions; openById: Map id -> {busy, waiting}.
function classify(items, openById) {
  return items.map((item) => ({ ...item, status: statusOf(openById.get(item.id)), open: openById.has(item.id) }));
}

function filterItems(items, filter) {
  if (!filter || filter === 'all') return items;
  return items.filter((i) => i.status === filter);
}

// The suggestion row for "continue the last conversation": only when no open conversation
// already shows a listed session, and there is something to continue.
function continueSuggestion(items, openById) {
  if (!items.length || openById.size > 0) return null;
  return items[0];
}

// Tracks one tab: "finished" is set when a turn ends while the tab is not visible and is cleared
// as soon as the tab is visible again. "waiting" always follows the live state.
function createTabTracker() {
  let wasBusy = false;
  let finished = false;
  return {
    update({ busy, waiting, visible }) {
      if (wasBusy && !busy && !visible) finished = true;
      if (visible) finished = false;
      wasBusy = busy;
      if (waiting) return 'waiting';
      return finished ? 'finished' : null;
    },
  };
}

function decorateTitle(base, state) {
  if (state === 'waiting') return `${MARK_WAITING} ${base}`;
  if (state === 'finished') return `${MARK_FINISHED} ${base}`;
  return base;
}

// In-memory list of recently closed conversations (newest last); the same session is kept once.
function pushClosed(list, entry) {
  if (!entry || !entry.sessionId) return list;
  const next = list.filter((e) => e.sessionId !== entry.sessionId);
  next.push(entry);
  return next.slice(-CLOSED_MAX);
}

module.exports = {
  FILTERS, MARK_WAITING, MARK_FINISHED, CLOSED_MAX,
  statusOf, classify, filterItems, continueSuggestion, createTabTracker, decorateTitle, pushClosed,
};
