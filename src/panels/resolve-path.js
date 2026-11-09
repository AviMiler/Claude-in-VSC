// Turns a path from the chat (absolute, or relative to the workspace as the navigation tools print it)
// into an absolute path to open. Pure: the caller passes the roots and the existence check.
const path = require('path');

// p: the path; roots: workspace folders then the session cwd (empty entries skipped);
// exists(abs) -> boolean. An absolute path is returned as is. A relative path goes to the first root
// where it exists, else to the last root (the cwd), else is resolved against the process cwd.
function resolvePath(p, roots, exists) {
  const s = String(p || '');
  if (!s || path.isAbsolute(s)) return s;
  const list = (Array.isArray(roots) ? roots : []).filter(Boolean);
  for (const root of list) {
    const abs = path.resolve(root, s);
    if (exists(abs)) return abs;
  }
  return path.resolve(list.length ? list[list.length - 1] : '.', s);
}

module.exports = { resolvePath };
