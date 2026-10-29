// The "/" menu: the CLI's commands and skills (from its initialize response), filtered as you type.
(function () {
  const { el } = CL;
  const menuEl = document.getElementById('slash-menu');
  const MAX_ITEMS = 50;

  let commands = [];
  let shown = [];
  let sel = 0;
  let onPick = () => {};

  function setCommands(list) {
    commands = (list || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function isOpen() {
    return !menuEl.hidden;
  }

  function close() {
    menuEl.hidden = true;
  }

  function mark(idx) {
    sel = idx;
    const rows = menuEl.children;
    for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('sel', i === sel);
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }

  // query: the text after "/" (no spaces yet).
  function update(query, pick) {
    onPick = pick;
    const q = query.toLowerCase();
    const starts = commands.filter((c) => c.name.toLowerCase().startsWith(q));
    const contains = commands.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
    shown = starts.concat(contains).slice(0, MAX_ITEMS);
    if (!shown.length) return close();
    menuEl.replaceChildren(...shown.map((c, idx) => el('button', {
      class: 'slash-item',
      type: 'button',
      role: 'option',
      onmousedown: (e) => { e.preventDefault(); onPick(c); },
      onmouseenter: () => mark(idx),
    },
    el('span', { class: 'slash-name', text: `/${c.name}` }),
    c.argumentHint ? el('span', { class: 'slash-hint', text: c.argumentHint }) : null,
    el('span', { class: 'slash-desc', dir: 'auto', text: c.description || '' }))));
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

  CL.slashMenu = { setCommands, update, close, onKey, isOpen };
})();
