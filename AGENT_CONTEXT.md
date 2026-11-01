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
- No extension code exists yet for the roadmap features; all their decisions are closed (`PLAN.md`).
- Next step: package A of `PLAN.md` section 5 (settings, rebindable shortcuts, Open in Terminal, `environmentVariables`, launching `claude-bin.exe`), after the user approves the points marked ⚠️ in `PLAN.md` section 6 (items 6 and 7).
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
