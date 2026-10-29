// Markdown -> safe HTML with marked + highlight.js (both vendored, see webview/vendor/).
// Raw HTML in the source is shown as text, never injected; links go through the host.
(function () {
  const { escapeHtml } = CL;
  const AUTO_DETECT_MAX = 4000;
  const DIR_AUTO = 'p, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, td, th';
  const COPY_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3.5C3 2.7 3.7 2 4.5 2H10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

  function highlight(code, lang) {
    try {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      if (code.length <= AUTO_DETECT_MAX) return hljs.highlightAuto(code).value;
    } catch { /* fall through to plain text */ }
    return escapeHtml(code);
  }

  function codeBlock(code, lang) {
    const name = (lang || '').trim().split(/\s+/)[0];
    return `<div class="code-block"><div class="code-head"><span>${escapeHtml(name || 'קוד')}</span>`
      + `<button class="copy-btn" data-copy title="העתקה">${COPY_ICON}<span>העתקה</span></button></div>`
      + `<pre><code class="hljs">${highlight(code.replace(/\n$/, ''), name)}</code></pre></div>`;
  }

  const renderer = new marked.Renderer();
  renderer.html = (html) => escapeHtml(html);
  renderer.code = (code, lang) => codeBlock(code, lang);
  renderer.link = (href, title, text) => `<a href="${escapeHtml(href || '')}" data-link title="${escapeHtml(title || href || '')}">${text}</a>`;
  renderer.image = (href, title, text) => `<span class="md-image">[תמונה: ${escapeHtml(text || href || '')}]</span>`;
  renderer.table = (header, body) => `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>`;
  marked.use({ renderer, gfm: true, breaks: false });

  function render(target, text) {
    target.innerHTML = marked.parse(text || '');
    for (const node of target.querySelectorAll(DIR_AUTO)) node.setAttribute('dir', 'auto');
  }

  CL.markdown = { render, codeBlock };
})();
