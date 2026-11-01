# Agent context — Claude Code Local

Read first: `spec.md` (requirements, "as built"), `DECISIONS.md`, `ARCHITECTURE.md`, `PROJECT_MAP.md`.

## What this is
A VS Code extension (plain JS, no build, no npm) that is a Hebrew RTL front for the real `claude` CLI. The CLI is the only source of truth: the extension persists nothing (no globalState/workspaceState/own files) and reads history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`.

## Last Changes
- 2026-11-01: Feature roadmap for the extension decided in 8 stages (`docs/features-plan.md`) and the CLI probed on the user's machine (CLI 2.1.246, VS Code 1.91.1, local model `qwen3.8:27b` behind an OpenAI-compatible gateway) with `dev/probe-cli.js`, `dev/probe-standalone.js`, `dev/probe2-standalone.js`, `dev/probe3-standalone.js`. No extension code changed. Why: the user wants the official extension's features reviewed one by one before building; findings and plan changes are in `docs/features-plan.md` ("ממצאי הבדיקות"), setup changes in `SETUP.md` section 5.
- 2026-10-30: basic version (v0.1.0) built and verified GO after one fix round: tab + sidebar chat, streaming Markdown/code, permission/plan/question cards, mode and model pickers, `/` menu, history list with `--resume`. Why: first milestone requested by the user.
- Deviations from the first plan: real `AskUserQuestion` picker; `--allow-dangerously-skip-permissions` launch flag for bypass mode; stop shows "■ הופסק" and closes locally after 4 s without a `result`; extra "השבוע" history group; no package `icon`; `scripts/package.ps1` NOT built.

## Pending / not verified
- Update 2026-11-01 (user's machine): the user reports the extension works there (VS Code 1.91.1, real model replies). Verified against the real CLI 2.1.246: `interrupt` answers `{still_queued: []}` and a `result` (`error_during_execution`, `terminal_reason: aborted_streaming`) arrives in about 0.5 s with the process still alive; `--resume` and `--resume --fork-session` work; `AskUserQuestion` answers through `updatedInput.answers` work; a message sent during a turn is queued and answered after the first; `mcp_status`/`mcp_reconnect`/`mcp_toggle`, `get_context_usage`, `rewind_files` (after enabling checkpoints) and `stop_task` exist. Facts that change the plan: no thinking blocks from this model, no `TodoWrite` (use `TaskCreate`/`TaskUpdate`), `!` is interpreted by the model, `/loop` runs unsolicited turns, `claudePath` must be `claude-bin.exe` (the `claude.cmd` wrapper prompts for a model), `API_TIMEOUT_MS`, `CLAUDE_ENABLE_STREAM_WATCHDOG` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS` must come from the extension's environment.
- Still open: results of `dev/probe3-standalone.js` (real rewind, `updatedInput` on Edit, Write/Bash/ExitPlanMode permission shapes, `set_model` to a non-alias id, auto mode), the model's real `num_ctx`, an IDE-server prototype, the manual checklist inside VS Code 1.91.1 (secondary sidebar is not available there), and two user decisions (fetch `/v1/models` from the extension; drop `!` mode).
- The CLI on this machine is not logged in (`claude auth status`: loggedIn false). The user must run `claude auth login`; only then can a real model reply be tested.
- Manual checklist in spec.md "Testing" has not run inside VS Code (activation alone was checked in VS Code 1.143.1). Not verified: CSP in a real webview, real CLI behaviour after `interrupt`, `--resume` of a past chat, the real `can_use_tool` response shapes.
- Ctrl+Shift+Esc is Windows' Task Manager shortcut and probably never reaches VS Code (known limit).
- Next: user logs in, then the manual checklist in the Extension Development Host; then `scripts/package.ps1`; later milestones per `plan.md` (diff review, editor context, MCP/IDE server, terminal mode, sessions panel...).

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser UI preview: `.claude/launch.json` "chat-preview".
- Do not add persistence or a build step; do not write to the CLI's transcripts. Docs are English; every user-facing string and every question to the user is Hebrew.
- `plan.md` is the older four-milestone plan for the OneDrive project and is left unchanged.
