// In-memory list of the open conversations in this window (tabs and sidebar views).
// Nothing here is persisted.

function createRegistry() {
  const entries = new Set();
  let lastTab = null;

  return {
    // entry: {conversation, reveal(), isTab}
    add(entry) {
      entries.add(entry);
      if (entry.isTab) lastTab = entry;
      return { dispose: () => this.remove(entry) };
    },
    remove(entry) {
      entries.delete(entry);
      if (lastTab === entry) lastTab = [...entries].reverse().find((e) => e.isTab) || null;
    },
    markActive(entry) {
      if (entry.isTab) lastTab = entry;
    },
    lastTab: () => lastTab,
    findBySession(sessionId) {
      for (const e of entries) if (sessionId && e.conversation.sessionId === sessionId) return e;
      return null;
    },
    disposeAll() {
      for (const e of [...entries]) e.conversation.dispose();
      entries.clear();
    },
  };
}

module.exports = { createRegistry };
