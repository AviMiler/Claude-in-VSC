# Dependencies

No npm packages, no `package-lock`, no build step. Third-party code is vendored as plain JS files in `webview/vendor/`, downloaded once from cdn.jsdelivr.net and never fetched at runtime.

| Library | Version | Files | License | Used for |
|---|---|---|---|---|
| marked | 12.0.2 | `marked.umd.js`, `marked.LICENSE.md` | MIT | Markdown to HTML in `webview/chat/markdown.js` (raw HTML is escaped there; marked does not sanitize) |
| highlight.js | 11.9.0 | `highlight.min.js`, `highlight.LICENSE` | BSD-3-Clause | code coloring (common-languages bundle) |
| highlight.js PowerShell grammar | 11.9.0 | `powershell.min.js` | BSD-3-Clause | PowerShell blocks (not in the common bundle) |

- To upgrade: replace the files, keep the license files, update this table and run the browser preview.
- The extension host uses only Node built-ins and the `vscode` API.
