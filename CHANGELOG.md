# Changelog

## 2026-10-30
- Basic version built (v0.1.0): Hebrew RTL VS Code extension as a front for the real Claude Code CLI (tab + sidebar chat, Markdown/code rendering, permission cards and mode selector, `/` menu, model picker, read-only history from the CLI's transcripts with `--resume`). Why: the user asked for a working basic version that looks like the official extension and keeps the CLI as the only source of truth.
- Added vendored `marked` 12.0.2 and `highlight.js` 11.9.0 (+ PowerShell grammar) under `webview/vendor/`. Why: complete Markdown and code coloring without a build step or network.
- Deviations from the spec (see spec.md and DECISIONS.md): `AskUserQuestion` has a real picker; `--allow-dangerously-skip-permissions` is added when bypass is allowed; stopped turns show "■ הופסק" with a 4 s local close; history group "השבוע" added; no package `icon`; `scripts/package.ps1` deferred.
- Verified: 22/22 unit tests, browser preview (dark/light), activation in VS Code 1.143.1. NOT verified: a real model reply (CLI not logged in), a conversation in VS Code, the CSP in a real webview, real `interrupt` behaviour, the manual checklist.
