// Dev only: serves the chat webview in a normal browser with a simulated host
// (dev/preview-host.js) and VS Code-like theme variables (dev/preview-theme.css), to review the
// design without launching VS Code. Usage: node dev/preview-server.js [port]  (default 5199)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2]) || 5199;
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' };

function page(theme) {
  const html = fs.readFileSync(path.join(ROOT, 'webview', 'chat', 'index.html'), 'utf8');
  return html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace(/\{\{nonce\}\}/g, 'dev')
    .replace(/\{\{chat\}\}/g, '/webview/chat')
    .replace(/\{\{vendor\}\}/g, '/webview/vendor')
    .replace('<body>', `<body class="vscode-${theme}">`)
    .replace('</head>', '<link rel="stylesheet" href="/dev/preview-theme.css"></head>')
    .replace('<script nonce="dev" src="/webview/chat/util.js">', '<script src="/dev/preview-host.js"></script><script nonce="dev" src="/webview/chat/util.js">');
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page(url.searchParams.get('theme') === 'light' ? 'light' : 'dark'));
  }
  const file = path.normalize(path.join(ROOT, url.pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': `${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, 'localhost', () => console.log(`preview on http://localhost:${PORT}`));
