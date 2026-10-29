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
    const wrap = menuEl.parentElement.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    menuEl.style.insetInlineStart = `${Math.max(8, wrap.right - a.right)}px`;
    menuEl.hidden = false;
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
