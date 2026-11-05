// In-memory list of the open conversations in this window (in every place, shown or hidden),
// plus the recently closed ones (for Ctrl+Shift+T). Nothing here is persisted.
const { pushClosed } = require('./session-model');

function createRegistry() {
  const entries = new Set();
  const listeners = new Set();
  let closed = [];
  let lastSig = '';

  const emit = () => { for (const fn of [...listeners]) fn(); };

  return {
    // entry: {conversation, host, reveal()}
    add(entry) {
      entries.add(entry);
      emit();
      return { dispose: () => this.remove(entry) };
    },
    remove(entry) {
      if (!entries.delete(entry)) return;
      if (entry.conversation.sessionId && entry.conversation.hasMessages) {
        closed = pushClosed(closed, { sessionId: entry.conversation.sessionId });
      }
      emit();
    },
    findBySession(sessionId) {
      for (const e of entries) if (sessionId && e.conversation.sessionId === sessionId) return e;
      return null;
    },
    // Session id -> {busy, waiting} for the open conversations that have a session.
    openStates() {
      const map = new Map();
      for (const e of entries) {
        const c = e.conversation;
        if (c.sessionId) map.set(c.sessionId, { busy: c.busy, waiting: c.pending.size > 0 });
      }
      return map;
    },
    // Newest closed conversation that is not open again; removes it from the list.
    // Emits so the `claude-local:hasClosed` context key is refreshed when the list shrinks (F-6).
    popClosed() {
      const before = closed.length;
      let found = null;
      while (closed.length && !found) {
        const { sessionId } = closed[closed.length - 1];
        closed = closed.slice(0, -1);
        if (!this.findBySession(sessionId)) found = sessionId;
      }
      if (closed.length !== before) emit();
      return found;
    },
    hasClosed: () => closed.length > 0,
    onChange(fn) {
      listeners.add(fn);
      return { dispose: () => listeners.delete(fn) };
    },
    // Called on every conversation activity; only a change of any session's busy/waiting state
    // (not a streamed delta) reaches the listeners.
    changed() {
      const sig = JSON.stringify([...this.openStates()]);
      if (sig === lastSig) return;
      lastSig = sig;
      emit();
    },
    disposeAll() {
      for (const e of [...entries]) e.conversation.dispose();
      entries.clear();
    },
  };
}

module.exports = { createRegistry };
