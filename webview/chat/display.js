// Applies the display settings (focus view, time stamps, waiting words, scroll on send, motion, colours)
// and gives every message a speaker heading (the screen-reader label and, with time stamps on, a visible line).
(function () {
  const { el } = CL;
  const logic = CL.displayLogic;
  const itemsEl = document.getElementById('items');

  let settings = { spinnerVerbs: [], scrollToBottomOnSend: true };
  let replaying = false; // history is loaded in one go: its messages have no known time

  function apply(display) {
    if (!display) return;
    settings = display;
    const set = (name, on) => (on ? document.body.setAttribute(name, '') : document.body.removeAttribute(name));
    set('data-focus', display.focusView);
    set('data-timestamps', display.showMessageTimestamps);
    set('data-reduced-motion', display.prefersReducedMotion);
    // Own font sizes (0 = follow VS Code): the variables fall back to the VS Code values in chat.css.
    const size = (name, px) => (px > 0 ? document.body.style.setProperty(name, `${px}px`) : document.body.style.removeProperty(name));
    size('--cl-user-font', display.chatFontSize);
    size('--cl-user-code', display.codeFontSize);
    document.body.dataset.colorMode = display.colorMode === 'daltonized' ? 'daltonized' : 'default';
  }

  function heading(kind) {
    const node = el('h2', { class: 'msg-heading', text: logic.headingText(kind, replaying ? undefined : Date.now()) });
    node.dataset.speaker = kind;
    return node;
  }

  // Direct children of the thread: a user bubble or an assistant turn gets a heading placed before it.
  // The heading is a sibling, not a child, so it cannot change the bubble's text direction.
  function decorate(node) {
    if (!(node instanceof HTMLElement)) return;
    const kind = node.classList.contains('msg-user') ? 'user' : node.classList.contains('turn') ? 'assistant' : '';
    if (!kind || (node.previousElementSibling && node.previousElementSibling.classList.contains('msg-heading'))) return;
    node.before(heading(kind));
  }

  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach(decorate);
  }).observe(itemsEl, { childList: true });

  // The observer runs after the handler that loads a conversation, so the flag is set from the raw message.
  window.addEventListener('message', (e) => {
    if (e.data && (e.data.type === 'sessionLoaded' || e.data.type === 'restore')) {
      replaying = true;
      setTimeout(() => { replaying = false; }, 0);
    }
  }, true);

  // Focus view on/off for this conversation (the /focus command and the Ctrl+Alt+F command). Not stored:
  // the claudeLocal.focusView setting sets the start state, and a settings change applies it again.
  function toggleFocus() {
    const on = !document.body.hasAttribute('data-focus');
    document.body.toggleAttribute('data-focus', on);
    return on;
  }

  CL.display = {
    apply,
    toggleFocus,
    verb: (defaults) => logic.pickVerb(defaults, settings.spinnerVerbs),
    scrollOnSend: () => settings.scrollToBottomOnSend !== false,
    collapseLines: () => (Number.isInteger(settings.collapseUserMessageLines) ? settings.collapseUserMessageLines : 8),
    isReplaying: () => replaying,
  };
})();
