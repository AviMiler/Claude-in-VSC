// Shared helpers for the chat webview. Every webview script adds itself to window.CL.
(function () {
  const vscode = acquireVsCodeApi();

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function relTime(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'עכשיו';
    const m = Math.round(s / 60);
    if (m < 60) return `לפני ${m} דק׳`;
    const h = Math.round(m / 60);
    if (h === 1) return 'לפני שעה';
    if (h === 2) return 'לפני שעתיים';
    if (h < 24) return `לפני ${h} שעות`;
    const d = Math.round(h / 24);
    if (d === 1) return 'אתמול';
    if (d === 2) return 'לפני יומיים';
    if (d < 30) return `לפני ${d} ימים`;
    return new Date(ms).toLocaleDateString('he-IL');
  }

  function truncate(s, n) {
    return s.length > n ? `${s.slice(0, n - 1)}…` : s;
  }

  // Closes a popover when the user clicks outside it (and outside its opener).
  function onOutsideClick(popover, opener, close) {
    const handler = (e) => {
      if (popover.contains(e.target) || (opener && opener.contains(e.target))) return;
      close();
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }

  window.CL = {
    post: (msg) => vscode.postMessage(msg),
    el,
    escapeHtml,
    relTime,
    truncate,
    onOutsideClick,
  };
})();
