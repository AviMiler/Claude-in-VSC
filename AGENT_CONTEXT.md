# Agent context — Claude Code Local

Read first: `spec.md` (requirements, "as built"), `DECISIONS.md`, `ARCHITECTURE.md`, `PROJECT_MAP.md`.

## What this is
A VS Code extension (plain JS, no build, no npm) that is a Hebrew RTL front for the real `claude` CLI. The CLI is the only source of truth: the extension persists nothing (no globalState/workspaceState/own files) and reads history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`.

## Last Changes
- 2026-10-30: basic version (v0.1.0) built and verified GO after one fix round: tab + sidebar chat, streaming Markdown/code, permission/plan/question cards, mode and model pickers, `/` menu, history list with `--resume`. Why: first milestone requested by the user.
- Deviations from the first plan: real `AskUserQuestion` picker; `--allow-dangerously-skip-permissions` launch flag for bypass mode; stop shows "■ הופסק" and closes locally after 4 s without a `result`; extra "השבוע" history group; no package `icon`; `scripts/package.ps1` NOT built.

## Pending / not verified
- The CLI on this machine is not logged in (`claude auth status`: loggedIn false). The user must run `claude auth login`; only then can a real model reply be tested.
- Manual checklist in spec.md "Testing" has not run inside VS Code (activation alone was checked in VS Code 1.143.1). Not verified: CSP in a real webview, real CLI behaviour after `interrupt`, `--resume` of a past chat, the real `can_use_tool` response shapes.
- Ctrl+Shift+Esc is Windows' Task Manager shortcut and probably never reaches VS Code (known limit).
- Next: user logs in, then the manual checklist in the Extension Development Host; then `scripts/package.ps1`; later milestones per `plan.md` (diff review, editor context, MCP/IDE server, terminal mode, sessions panel...).

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser UI preview: `.claude/launch.json` "chat-preview".
- Do not add persistence or a build step; do not write to the CLI's transcripts. Docs are English; every user-facing string and every question to the user is Hebrew.
- `plan.md` is the older four-milestone plan for the OneDrive project and is left unchanged.
