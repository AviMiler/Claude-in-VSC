# Agent context — Claude Code Local

## Read first
- `spec.md` — what the extension is and does today ("as built"), with one "Verification status" section.
- `DECISIONS.md` — architecture-level decisions with alternatives and reasons.
- `docs/final-plan.md` — **the roadmap and the single source of truth for what to build next**: every feature decision with its reason, the settings table, the build order (packages A-G), open points.
- `ARCHITECTURE.md`, `PROJECT_MAP.md` (one line per file), `DEPENDENCIES.md` — structure, files, vendored libraries.
- `docs/conclusions.md` — findings about the CLI (2.1.246), the gateway and VS Code, each with its evidence, and what is still unknown. `docs/litellm-gateway.md` — the model gateway and Ollama.
- `SETUP.md` — install and settings for the user's machine (Hebrew). `dev/README.md` — probes, fake CLI, browser preview. `CHANGELOG.md` — what changed and why.

## What this is
A VS Code extension (plain JS, no build, no npm) that is a Hebrew RTL front for the real `claude` CLI. The CLI is the only source of truth: the extension persists nothing (no globalState/workspaceState/own files) and reads history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`.

## Current state (2026-11-01)
- The basic version (v0.1.0) is built and works on the user's machine (CLI 2.1.246, VS Code 1.91.1, local model `qwen3.8:27b` behind a LiteLLM gateway).
- No extension code exists yet for the roadmap features; all their decisions are closed (`docs/final-plan.md`).
- Next step: package A of `docs/final-plan.md` section 5 (settings, rebindable shortcuts, Open in Terminal, `environmentVariables`, launching `claude-bin.exe`), after the user approves the points marked ⚠️ in `docs/final-plan.md` section 6 (items 6 and 7).
- What is not verified yet: `spec.md` "Verification status", `docs/final-plan.md` section 6, `docs/conclusions.md` section 4. Recent changes: `CHANGELOG.md`.

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser UI preview: `.claude/launch.json` "chat-preview".
- Do not add persistence or a build step; do not write to the CLI's transcripts. Docs are English; every user-facing string and every question to the user is Hebrew.
- Working agreements with the user:
  - Decisions are asked one at a time with all implications (cost, pros, cons). When the user only asks a question, change no files.
  - Findings and changes go into the matching document, not only into the chat. Project docs are English; the exceptions that address the user are Hebrew (`SETUP.md`, `docs/`).
  - The user's machine has no GitHub access: anything meant to run there is delivered as a self-contained file (a .txt saved as UTF-8 with BOM and CRLF opens correctly in Notepad), and results come back as pasted text or screenshots.
  - Checks against the real CLI and model are run by the user from commands prepared here; scripts are tested first against `dev/fake-claude.js`. See `dev/README.md`.

## Git
- Work on `develop`, or on the branch the user or the session names explicitly. One commit per finished task (code + its docs + any spec change together).
- Stage only the files the task touched; never `git add -A`. Never force-push, never skip hooks.
- Push only when the user explicitly asks (remote: `origin` on GitHub). Merge into a main branch only when the user decides a version is ready.
