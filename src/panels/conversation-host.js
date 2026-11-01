// One place (the sidebar view or the editor tab) hosting several conversations, one visible at a
// time. "New conversation" never waits for or stops a running one: the running one keeps its CLI
// process and keeps working hidden; its permission requests stay pending and are signalled in the
// drawer, the view badge or the tab title, and in a notice in the visible conversation.
// In memory only: conversations die with the window (or with the editor tab).
const { Conversation } = require('./conversation');
const { routeMessage } = require('./message-router');
const transcripts = require('../history/transcripts');
const { workspaceCwd } = require('../util/workspace');
const { conversationRow, hiddenAttention, TITLE_FALLBACK } = require('./session-model');

const NOTICES = {
  waiting: (t) => `שיחה ברקע ממתינה לאישור: ${t}`,
  unread: (t) => `שיחה ברקע סיימה: ${t}`,
};

// The drawer's messages; everything else goes to the visible conversation (message-router.js).
const HOST_ROUTES = {
  ready: (h) => h.onWebviewReady(),
  newConversation: (h, m) => h.newConversation({ ui: m.ui }),
  switchConversation: (h, m) => h.switchTo(String(m.id), m.ui),
  closeConversation: (h, m) => h.close(String(m.id)),
  openSession: (h, m) => h.openSession(String(m.id), { ui: m.ui }),
  renameConversation: (h, m) => h.rename(m),
  listConversations: (h) => h.postList(),
  viewFocus: (h, m) => { h.focused = m.on === true; },
};

class ConversationHost {
  // kind: 'sidebar' | 'editor'. revealPlace(): shows the place. isVisible(): the place is on screen.
  // onState({title, attention}): the place updates its title, badge or tab marker.
  constructor({ services, kind, revealPlace, isVisible, onState }) {
    this.services = services;
    this.kind = kind;
    this.revealPlace = revealPlace;
    this.isVisible = isVisible;
    this.onState = onState || (() => {});
    this.conversations = new Map(); // id -> {conversation, reg}
    this.current = null;
    this.webview = null;
    this.ready = false;
    this.focused = false;
    this.sub = null;
    this.lastSig = '';
    this.lastStatus = new Map(); // id -> status, for the background notices
  }

  log(text) {
    this.services.logger.info('session', text);
  }

  // --- the webview ---------------------------------------------------------------------------

  bind(webview) {
    if (this.sub) this.sub.dispose();
    if (this.current) this.current.detach();
    this.webview = webview;
    this.ready = false;
    this.sub = webview.onDidReceiveMessage((msg) => this.onMessage(msg));
  }

  // The webview is gone (the view was disposed); conversations keep running until it comes back.
  unbind() {
    if (this.sub) this.sub.dispose();
    this.sub = null;
    if (this.current) this.current.detach();
    this.webview = null;
    this.ready = false;
  }

  onMessage(msg) {
    const own = msg && HOST_ROUTES[msg.type];
    if (own) own(this, msg);
    else if (this.current) {
      routeMessage(this.current, msg);
      this.onActivity(this.current); // an answered permission changes the status without a post
    }
  }

  onWebviewReady() {
    this.ready = true;
    if (this.current) this.current.attach(this.webview);
    else this.create({});
    this.refresh(true);
  }

  postWebview(msg) {
    if (this.ready && this.webview) this.webview.postMessage(msg);
  }

  // --- conversations -------------------------------------------------------------------------

  create({ resume, ui, rename } = {}) {
    const conversation = new Conversation({
      services: this.services,
      onTitle: () => this.refresh(),
      onActivity: () => this.onActivity(conversation),
      isShown: () => this.current === conversation && this.ready && this.isVisible(),
    });
    if (resume) conversation.pendingResume = resume;
    if (rename) conversation.pendingRename = rename;
    const reg = this.services.registry.add({
      conversation,
      host: this,
      isTab: this.kind === 'editor',
      reveal: () => this.reveal(conversation),
    });
    this.conversations.set(conversation.id, { conversation, reg });
    const others = [...this.conversations.values()].filter((e) => e.conversation !== conversation);
    const running = others.filter((e) => e.conversation.busy).map((e) => e.conversation.id);
    this.log(`new conversation ${conversation.id} in ${this.kind}${resume ? ` (resume ${resume})` : ''}; open ${this.conversations.size}, running in background: ${running.length ? running.join(',') : 'none'}`);
    this.show(conversation, ui);
    return conversation;
  }

  // Never refused: a running conversation stays as it is and keeps working hidden.
  newConversation({ ui } = {}) {
    return this.create({ ui });
  }

  show(conversation, ui) {
    const prev = this.current;
    if (prev && prev !== conversation) {
      prev.detach(ui);
      this.log(`switch ${prev.id} -> ${conversation.id} (${prev.id} ${prev.busy ? 'keeps running in the background' : 'idle'}${prev.pending.size ? `, ${prev.pending.size} waiting for permission` : ''})`);
    }
    this.current = conversation;
    if (this.ready && conversation.webview !== this.webview) conversation.attach(this.webview);
    this.refresh(true);
  }

  switchTo(id, ui) {
    const entry = this.conversations.get(id);
    if (entry) this.show(entry.conversation, ui);
  }

  reveal(conversation) {
    this.revealPlace();
    if (this.current !== conversation) this.show(conversation);
  }

  // A past conversation: focus it where it is open, else load it into an empty visible
  // conversation, else open it as a new conversation next to the others.
  openSession(sessionId, { ui, rename } = {}) {
    const open = this.services.registry.findBySession(sessionId);
    if (open) {
      if (open.host === this) this.show(open.conversation, ui);
      else open.reveal();
      if (rename) open.conversation.renameSession(rename);
      return open.conversation;
    }
    const cur = this.current;
    if (cur && cur.isEmpty() && cur.started) {
      this.log(`open session ${sessionId} in the empty conversation ${cur.id}`);
      if (rename) cur.pendingRename = rename;
      cur.loadSession(sessionId);
      return cur;
    }
    return this.create({ resume: sessionId, ui, rename });
  }

  rename({ id, sessionId, title }) {
    const entry = id && this.conversations.get(String(id));
    if (entry) {
      if (!entry.conversation.renameSession(title)) this.postWebview({ type: 'notice', text: 'אפשר לשנות שם לשיחה שכבר נשלחה בה הודעה, כש-Claude לא עובד.' });
      return;
    }
    if (sessionId) this.openSession(String(sessionId), { rename: title });
  }

  close(id) {
    const entry = this.conversations.get(id);
    if (!entry) return;
    const c = entry.conversation;
    this.log(`close ${c.id} (busy=${c.busy}, session=${c.sessionId || 'none'})`);
    this.conversations.delete(id);
    this.lastStatus.delete(id);
    entry.reg.dispose();
    c.dispose();
    if (this.current !== c) return this.refresh(true);
    this.current = null;
    const rest = [...this.conversations.values()];
    if (rest.length) return this.show(rest[rest.length - 1].conversation);
    if (this.ready) return this.create({});
    return this.refresh(true);
  }

  // --- drawer and markers --------------------------------------------------------------------

  rows() {
    const id = this.current && this.current.id;
    return [...this.conversations.values()].map((e) => conversationRow(e.conversation, id));
  }

  postList() {
    let past = [];
    try {
      past = transcripts.listSessions(this.current ? this.current.cwd : workspaceCwd().cwd);
    } catch (err) {
      this.services.logger.warn('history', `listSessions failed: ${err.message}`);
    }
    const open = this.rows();
    const openIds = new Set(open.map((r) => r.sessionId).filter(Boolean));
    // Every open conversation of this window counts, not only this place's.
    for (const s of this.services.registry.openStates().keys()) openIds.add(s);
    this.services.logger.info('history', `drawer: ${open.length} open, ${past.length} past`);
    this.postWebview({ type: 'conversations', open, past: past.filter((p) => !openIds.has(p.id)) });
  }

  // Called on every message of every conversation (streamed pieces too), so it only compares a
  // small signature and does work when a status or a title changed.
  onActivity(conversation) {
    this.services.registry.changed();
    const status = conversationRow(conversation, null).status;
    const before = this.lastStatus.get(conversation.id);
    if (status !== before) {
      this.lastStatus.set(conversation.id, status);
      if (conversation !== this.current && NOTICES[status]) {
        this.log(`background conversation ${conversation.id} ${status === 'waiting' ? 'waits for permission' : 'finished'}`);
        this.postWebview({ type: 'notice', text: NOTICES[status](conversation.title || TITLE_FALLBACK) });
      }
    }
    this.refresh();
  }

  // The visibility of the place changed: a shown conversation is read.
  onVisibility() {
    if (this.current && this.isVisible()) this.current.unread = false;
    this.refresh(true);
  }

  refresh(force = false) {
    const rows = this.rows();
    const shownId = this.current && this.ready && this.isVisible() ? this.current.id : null;
    const attention = hiddenAttention(rows, shownId);
    const title = (this.current && this.current.title) || '';
    const sig = JSON.stringify([rows, attention.state, title, shownId]);
    if (!force && sig === this.lastSig) return;
    this.lastSig = sig;
    this.onState({ title, attention });
    this.postWebview({ type: 'conversationStates', open: rows, attention: hiddenAttention(rows, this.current && this.current.id) });
  }

  dispose() {
    if (this.sub) this.sub.dispose();
    for (const { conversation, reg } of this.conversations.values()) {
      reg.dispose();
      conversation.dispose();
    }
    this.conversations.clear();
    this.current = null;
  }
}

module.exports = { ConversationHost, HOST_ROUTES };
