// The "/" menu: the CLI's commands and skills (from its initialize response), filtered as you type.
(function () {
  const { el } = CL;
  const menuEl = document.getElementById('slash-menu');
  const MAX_ITEMS = 50;

  let commands = [];
  let meta = {};
  let shown = [];
  let sel = 0;
  let onPick = () => {};

  function retag(list) {
    commands = CL.prompt.classify(list, meta);
  }

  let rawCommands = [];

  function setCommands(list) {
    rawCommands = list || [];
    retag(rawCommands);
  }

  // From `system/init`: which names are skills and which only work in the terminal.
  function setMeta(m) {
    meta = { skills: m.skills || meta.skills, terminalOnly: m.terminalOnly || meta.terminalOnly };
    retag(rawCommands);
  }

  function getMeta() {
    return meta;
  }

  function isOpen() {
    return !menuEl.hidden;
  }

  function close() {
    menuEl.hidden = true;
  }

  function mark(idx) {
    sel = idx;
    const rows = menuEl.querySelectorAll('.slash-item');
    rows.forEach((row, i) => row.classList.toggle('sel', i === sel));
    if (rows[sel]) rows[sel].scrollIntoView({ block: 'nearest' });
  }

  // query: the text after "/" (no spaces yet).
  function update(query, pick) {
    onPick = pick;
    shown = CL.prompt.filterCommands(commands, query, MAX_ITEMS);
    if (!shown.length) return close();
    const rows = [];
    let lastGroup = null;
    shown.forEach((c, idx) => {
      if (c.group !== lastGroup) {
        lastGroup = c.group;
        const g = CL.prompt.GROUPS.find((x) => x.id === c.group);
        rows.push(el('div', { class: 'slash-group', role: 'presentation', text: g ? g.label : '' }));
      }
      rows.push(el('button', {
        class: `slash-item${c.group === 'terminal' ? ' disabled' : ''}`,
        type: 'button',
        role: 'option',
        'aria-disabled': c.group === 'terminal' ? 'true' : null,
        'data-idx': String(idx),
        onmousedown: (e) => { e.preventDefault(); onPick(c); },
        onmouseenter: () => mark(idx),
      },
      el('span', { class: 'slash-name', text: `/${c.name}` }),
      c.argumentHint ? el('span', { class: 'slash-hint', text: c.argumentHint }) : null,
      el('span', { class: 'slash-desc', dir: 'auto', text: c.description || '' })));
    });
    menuEl.replaceChildren(...rows);
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

  CL.slashMenu = { setCommands, setMeta, getMeta, update, close, onKey, isOpen };
})();
