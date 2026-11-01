# Agent context — Claude Code Local

## Read first
- `spec.md` — what the extension is and does today ("as built"), with one "Verification status" section.
- `DECISIONS.md` — architecture-level decisions with alternatives and reasons.
- `PLAN.md` — **the roadmap and the single source of truth for what to build next**: every feature decision with its reason, the settings table, the build order (packages A-G), open points.
- `ARCHITECTURE.md`, `PROJECT_MAP.md` (one line per file), `DEPENDENCIES.md` — structure, files; vendored libraries and the measured findings about the CLI (2.1.246), the gateway, Ollama and VS Code, each with its evidence and what is still unknown.
- `git-instructions.md` — the git workflow (branches, commits, push rules).
- `SETUP.md` — install and settings for the user's machine (Hebrew). `dev/README.md` — probes, fake CLI, browser preview. `CHANGELOG.md` — what changed and why.

## Models: mandatory
**Development of this project MUST use only the models below, by the task type below. Fable is NOT used here; Opus is the strongest model allowed.**

| Task | Model (mandatory) |
|---|---|
| Packages A, C, E, G (settings, shortcuts, `/` menu, error cards, accessibility), and package B's sessions/history/rename | **Sonnet 5.5** (`claude-sonnet-5-5`) |
| Package B's checkpoints, background tasks, `/diff`, `/loop`; package D's model-switch restart with `--resume`; package F (IDE server and its hand-written WebSocket codec, per-block diff approval); any change to the stream-json/control protocol handling or to permission handling; code review between packages | **Opus 5.5** (`claude-opus-5-5`) |
| Trivial edits only (doc wording, renames, small fixes) | **Haiku 5.5** (`claude-haiku-5-5`) |

If the session is not on the required model for the task, **stop and ask the user to switch** before writing code.

## What this is
A VS Code extension (plain JS, no build, no npm) that is a Hebrew RTL front for the real `claude` CLI. The CLI is the only source of truth: the extension persists nothing (no globalState/workspaceState/own files) and reads history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`.

## Current state (2026-11-01)
- The basic version (v0.1.0) is built and works on the user's machine (CLI 2.1.246, VS Code 1.91.1, local model `qwen3.8:27b` behind a LiteLLM gateway).
- Package A is done on branch `package-a-settings-shortcuts` (not committed yet when written): the new settings, `environmentVariables`, Open in Terminal, rebindable shortcuts (Ctrl+Esc, Ctrl+N opt-in, Keyboard Shortcuts command), `claude-bin.exe` documented in `SETUP.md`. Unit tests 32/32; the new VS Code commands and keys are unverified in real VS Code. The `rewind` key is only a hook until package B.
- Package C is **partly done** on branch `pkg-c-prompt-box` (built on package A's branch): Auto mode, grouped `/` menu + terminal-only card, client-side cancellable queue + prompt history, copy button, `@` mentions, Alt+K (`@path`), `/plan` and `/plan open`, images, Shift-drag files. Unit tests 46/46; nothing run in real VS Code. **Remaining from C:** `/btw`, LaTeX (bundled KaTeX). Details: `CHANGELOG.md`.
- Package B1 (Sonnet part of B) is done on branch `pkg-b1-sessions`: Activity Bar sessions TreeView (`claudeLocalHistory`) with temporary filters, rename through the CLI's `/rename`, reopen closed conversation (Ctrl+Shift+T, in-memory list), emoji tab markers (blue waiting for permission, orange finished while hidden), "continue the last conversation" suggestion row. Unit tests 60/60; nothing run in real VS Code, and `/rename` as user text is untested against the real CLI. Details: `CHANGELOG.md`.
- Package B2 is **in progress** on branch `pkg-b2-checkpoints`: item 1 done (`/diff` + shared diff module `src/diff/`, tests 64/64, real VS Code rendering unverified). Item 2 done too (checkpoints: rewind code + fork only; tests 69/69; real-CLI use unverified; conversation rewind and "both" not offered). Item 3 done (background task bar with stop; no "move to background" button, pending the user's decision, `DECISIONS.md`; tests 73/73; probe4 findings in `DEPENDENCIES.md`). Item 5a done (pinned task list, live only; tests 78/78; structured-result field name unconfirmed). **Not built, next steps:** 5b agent cards and 4 `/loop` indicator (probe4 facts are in `DEPENDENCIES.md` rows 37-38).
- Open user item: check whether Ctrl+Esc opens the Windows Start menu (`SETUP.md` section 7); if so, rebind `claude-local.focusToggle`.
- Next step: package B2 of `PLAN.md` section 5, **Opus 5.5 required** (checkpoints incl. the `rewind` action, background tasks, `/diff` with the shared diff-view module, `/loop` indicator, agent cards, pinned task list; starts with the sub-agent / `TaskCreate` checks). The other roadmap features are not built; their decisions are closed (`PLAN.md`).
- What is not verified yet: `spec.md` "Verification status", `PLAN.md` section 6, `DEPENDENCIES.md` section 5. Recent changes: `CHANGELOG.md`.

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser UI preview: `.claude/launch.json` "chat-preview".
- Do not add persistence or a build step; do not write to the CLI's transcripts. Docs are English; every user-facing string and every question to the user is Hebrew.
- Working agreements with the user:
  - Decisions are asked one at a time with all implications (cost, pros, cons). When the user only asks a question, change no files.
  - Findings and changes go into the matching document, not only into the chat. Project docs are English; the exceptions that address the user are Hebrew (`SETUP.md`).
  - The user's machine has no GitHub access: anything meant to run there is delivered as a self-contained file (a .txt saved as UTF-8 with BOM and CRLF opens correctly in Notepad), and results come back as pasted text or screenshots.
  - Checks against the real CLI and model are run by the user from commands prepared here; scripts are tested first against `dev/fake-claude.js`. See `dev/README.md`.

## Git
See `git-instructions.md` (work on `develop`, one commit per task, stage specific files, push only on request).
