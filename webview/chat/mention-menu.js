// The "@" menu: files and folders of the workspace (the host lists and ranks them).
(function () {
  const { el, post } = CL;
  const menuEl = document.getElementById('mention-menu');

  let shown = [];
  let sel = 0;
  let seq = 0;
  let onPick = () => {};

  function isOpen() {
    return !menuEl.hidden;
  }

  function close() {
    menuEl.hidden = true;
    seq += 1; // late results of an earlier query are dropped
  }

  function mark(idx) {
    sel = idx;
    const rows = menuEl.children;
    for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('sel', i === sel);
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }

  function request(query, pick) {
    onPick = pick;
    seq += 1;
    post({ type: 'mentionSearch', query, seq });
  }

  function setResults(items, forSeq) {
    if (forSeq !== seq) return;
    shown = items || [];
    if (!shown.length) {
      menuEl.hidden = true;
      return;
    }
    menuEl.replaceChildren(...shown.map((it, idx) => el('button', {
      class: 'slash-item',
      type: 'button',
      role: 'option',
      onmousedown: (e) => { e.preventDefault(); onPick(it); },
      onmouseenter: () => mark(idx),
    },
    el('span', { class: 'slash-name', dir: 'ltr', text: `${it.isDir ? '📁' : '📄'} ${it.path}` }))));
    menuEl.hidden = false;
    mark(0);
  }

  // Returns true when the key was handled by the menu.
  function onKey(e) {
    if (!isOpen()) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      mark((sel + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      onPick(shown[sel]);
      return true;
    }
    if (e.key === 'Escape') {
      close();
      return true;
    }
    return false;
  }

  CL.mentions = { request, setResults, close, onKey, isOpen };
})();
