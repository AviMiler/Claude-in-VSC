// A small popover menu above the composer, used by the mode and model pickers.
(function () {
  const { el, onOutsideClick } = CL;
  const menuEl = document.getElementById('menu');
  let cleanup = null;

  function close() {
    menuEl.hidden = true;
    menuEl.replaceChildren();
    if (cleanup) cleanup();
    cleanup = null;
  }

  // Physical left, measured after the menu is shown: its right edge lines up with the opener's
  // (the RTL start), then it is pushed back inside the composer so it never runs past the tab.
  function place(anchor) {
    const wrap = menuEl.parentElement.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const width = Math.min(menuEl.offsetWidth, wrap.width - 16);
    const room = wrap.width - width - 8;
    menuEl.style.left = `${Math.max(8, Math.min(a.right - wrap.left - width, room))}px`;
  }

  // items: [{value, label, desc?, icon?, checked?}]
  function open(anchor, items, onPick) {
    close();
    let sel = Math.max(0, items.findIndex((i) => i.checked));
    const buttons = items.map((item, idx) => el('button', {
      class: 'menu-item',
      role: 'menuitem',
      onclick: () => { close(); onPick(item.value); },
      onmouseenter: () => mark(idx),
    },
    el('span', { class: 'menu-item-icon', text: item.icon || '' }),
    el('span', { class: 'menu-item-body' },
      el('span', { dir: 'auto', text: item.label }),
      item.desc ? el('span', { class: 'menu-item-desc', dir: 'auto', text: item.desc }) : null),
    item.checked ? el('span', { class: 'menu-item-check', text: '✓' }) : null));

    function mark(idx) {
      sel = idx;
      buttons.forEach((b, i) => b.classList.toggle('sel', i === sel));
    }

    menuEl.append(...buttons);
    menuEl.hidden = false;
    place(anchor);
    mark(sel);
    buttons[sel].focus();
    menuEl.onkeydown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        mark((sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
        buttons[sel].focus();
      } else if (e.key === 'Escape') {
        close();
        anchor.focus();
      }
    };
    cleanup = onOutsideClick(menuEl, anchor, close);
  }

  CL.menu = { open, close };
})();
