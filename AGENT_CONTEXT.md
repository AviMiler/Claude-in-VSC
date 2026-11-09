# Agent context — Claude Code Local

Short session brief. Facts live in one place each: behavior `spec.md`, decisions and reasons `DECISIONS.md`, roadmap/status/open points `PLAN.md`, history `CHANGELOG.md`.

## Read first
- `spec.md` — what the extension does today ("as built"), one "Verification status" section.
- `DECISIONS.md` — decisions with alternatives and reasons.
- `PLAN.md` — **the single source of truth for what to build next**: feature decisions with reasons, build order (packages A-K), open points.
- `ARCHITECTURE.md`, `PROJECT_MAP.md` (one line per file), `DEPENDENCIES.md` (vendored libraries; measured findings about the CLI 2.1.246, the gateway, Ollama, VS Code, each with evidence and what is unknown).
- `FIXES.md` — open user-reported problems; read before changing conversation placement or the UI.
- `git-instructions.md` — git workflow. `SETUP.md` — install and settings for the user's machine (Hebrew). `dev/README.md` — probes, fake CLI, browser preview. `FUTURE_FEATURES.md` — undecided ideas. `CHANGELOG.md` — what changed and why.

## Models: by task difficulty (user, 2026-11-09)
Pick the model and effort for each task (and each subagent) by how hard that task actually is, not by package or area. Rough guide: trivial edits (doc wording, renames, comments) → Haiku or Sonnet low; ordinary code and checks → Sonnet medium; genuinely hard or risky work (protocol changes that are hard to verify, tricky concurrency, broad cross-cutting changes) → Opus. Fable is not used. (Replaces the earlier per-package mandatory table.)

## Subagent and session limits: mandatory
Added 2026-11-05 after one Opus subagent used about 4.1M effective tokens on a small change (F-8/F-9; 25% was two cache rewrites after idle gaps, 15% hunting for Node and building ad-hoc test harnesses).
- **No environment hunting.** If `node` is missing or a check cannot run, STOP and report what could not run and the exact command for the user. No disk search for runtimes, no fake server/harness page/compiled helper in place of the test run.
- **Install nothing** (winget/choco/npm/pip, downloads, services) without asking first.
- **Budget in the brief:** every subagent/session brief states a call limit (default 40 tool calls for a small fix); at the limit, commit what is done and report.
- **Small reads:** line ranges, not whole files (`sed -n`, Grep with context); never dump a changelog or transcript; load only the skills the stage needs.
- **No waiting:** a background agent finishes and reports in its final message; no waiting on timers, servers or browser pages (a subagent's prompt cache survived under 10 minutes, so each wake-up rewrites its context).
- **Split big work** into short agents (build, then docs) instead of one long agent past 200k tokens.

## What this is
A VS Code extension (plain JS, no build, no npm): a Hebrew RTL front for the real `claude` CLI. The CLI is the only source of truth: the extension persists nothing (no globalState/workspaceState/own files; one exception, the IDE lock file, `DECISIONS.md` 2026-11-08) and reads history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`. The basic version (v0.1.0) works on the user's machine (CLI 2.1.246, VS Code 1.91.1, local model `qwen3.8:27b` behind a LiteLLM gateway).

## Constraints (mandatory)
- **No internet on the user's machine.** A few files can be brought in (delivered as under "Working agreements"). No installs from the network (`npm install`, marketplace/extension downloads, package managers, runtime fetching). Code libraries only as a last resort: vendor plain files under `webview/vendor/` only when truly no other way, after trying VS Code APIs, Node built-ins, the CLI and hand-written code; record each exception in `DEPENDENCIES.md` with the reason. When proposing a feature, say first what it needs from outside the repo.
- Docs are English; every user-facing string and every question to the user is Hebrew (exception addressing the user: `SETUP.md`).
- No persistence, no build step, no writing to the CLI's transcripts.
- Push only when the user asks. Never stage the untracked `שליחה` zip/folder.
- Files for the user to run are self-contained TXT, UTF-8 with BOM and CRLF.

## Current state (2026-11-09)
- **Latest:** package K built (file chip + lines chip, one `withContext` channel, `claudeLocal.ideServer` default false), the whole UI restyled to the official extension 2.1.319 look (theme follows VS Code; forced dark rejected by the user), popovers clamped inside the composer. Why/what: `PLAN.md` section 10, `CHANGELOG.md` 2026-11-09. Tests 269/269 (one loaded run had 3 unexplained timing failures); browser preview only.
- **Package status:** `PLAN.md` section 5 (A, B, C, D, E, G, H done; F and I partly; J = all eight navigation tools built; K built). Not built and not planned: conversation rewind / "both", "move to background" (user dropped them, `PLAN.md` section 9).
- **Unverified everywhere:** real VS Code (1.91.1 and the user's 1.124.2) and the real CLI. The list of open user checks is `dev/open-checks.txt`; the full step-by-step file is `dev/must-check.txt`. Per-area status: `spec.md` "Verification status", `PLAN.md` section 6, `DEPENDENCIES.md` section 5.
- **Open for the user:** run `dev/check-all.txt` "בדיקה 8", `dev/check-7.html` 7.6 (usage gauge), `dev/check-model-switch.txt` (F-8/F-9 on CLI 2.1.246), `dev/check-ide-server.txt` (rename back to `.ps1` to run; IDE token header and method names; `openDiff` waits for it); `/btw` still does not see the main conversation (decision pending); Ctrl+Alt+E and F-6 (Ctrl+Shift+T from the sidebar) in real VS Code.
- **Also built 2026-11-09:** explicit "פתיחה בעורך" button on tool rows, navigation chat cards, the cumulative "שינויים בשיחה" changes card (reset by `/clear`), `/` and `@` menus mid-sentence. Tests 287/287; unverified in real VS Code. Package I step 2 cancelled; `openDiff` and plan-approval buttons not built (only checks prepared). The detailed user check file is `dev/must-check.txt`. Details: `CHANGELOG.md`, `DECISIONS.md` 2026-11-09.
- **Next:** the user runs `dev/must-check.txt`; then decide `openDiff` and the plan-approval buttons from its results.

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser UI preview: `.claude/launch.json` "chat-preview".
- Working agreements with the user:
  - Decisions are asked one at a time with all implications (cost, pros, cons). When the user only asks a question, change no files.
  - Findings and changes go into the matching document, not only into the chat.
  - The user's machine has no GitHub access: anything meant to run there is delivered as a self-contained file; results come back as pasted text or screenshots.
  - Checks against the real CLI and model are run by the user from commands prepared here; scripts are tested first against `dev/fake-claude.js` (`dev/README.md`).
- Git: `git-instructions.md` (work on `develop`, one commit per task, stage specific files).
