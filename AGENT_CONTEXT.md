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
A VS Code extension (plain JS, no build, no npm): a Hebrew RTL front for the real `claude` CLI. The CLI is the only source of truth: the extension persists nothing (no globalState/workspaceState/own files) and reads history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`. The basic version (v0.1.0) works on the user's machine (CLI 2.1.246, VS Code 1.91.1, local model `qwen3.8:27b` behind a LiteLLM gateway).

## Constraints (mandatory)
- **No internet on the user's machine.** A few files can be brought in (delivered as under "Working agreements"). No installs from the network (`npm install`, marketplace/extension downloads, package managers, runtime fetching). Code libraries only as a last resort: vendor plain files under `webview/vendor/` only when truly no other way, after trying VS Code APIs, Node built-ins, the CLI and hand-written code; record each exception in `DEPENDENCIES.md` with the reason. When proposing a feature, say first what it needs from outside the repo.
- **Model-bound text is English (user, 2026-11-09).** Every text the extension itself sends to the CLI/model (editor-context blocks, deny/reject results, the image-only placeholder, injected prompts) is English; only the user's own typed text may be in another language; the UI stays Hebrew. Why: `DECISIONS.md` 2026-11-09.
- Docs are English; every user-facing string and every question to the user is Hebrew (exception addressing the user: `SETUP.md`).
- No persistence, no build step, no writing to the CLI's transcripts.
- Push only when the user asks. Never stage the untracked `שליחה` zip/folder.
- Files for the user to run are self-contained TXT, UTF-8 with BOM and CRLF.

## Current state (2026-11-09)
- **Latest:** package K built (file chip + lines chip, one `withContext` channel), the whole UI restyled to the official extension 2.1.319 look (theme follows VS Code; forced dark rejected by the user), popovers clamped inside the composer. Why/what: `PLAN.md` section 10, `CHANGELOG.md` 2026-11-09. Tests 269/269 (one loaded run had 3 unexplained timing failures); browser preview only.
- **Package status:** `PLAN.md` section 5 (A, B, C, D, E, G, H done; F and I partly; J = all eight navigation tools built, a ninth `getDiagnostics` built 2026-11-23; K built). Not built and not planned: conversation rewind / "both", "move to background" (user dropped them, `PLAN.md` section 9).
- **Unverified everywhere:** real VS Code (1.91.1 and the user's 1.124.2) and the real CLI. The list of open user checks is `dev/open-checks.txt`; the full step-by-step file is `dev/must-check.txt`. Per-area status: `spec.md` "Verification status", `PLAN.md` section 6, `DEPENDENCIES.md` section 5.
- **Open for the user:** run `dev/check-all.txt` "בדיקה 8", `dev/check-7.html` 7.6 (usage gauge), `dev/check-model-switch.txt` (F-8/F-9 on CLI 2.1.246); `/btw` still does not see the main conversation (decision pending); Ctrl+Alt+E and F-6 (Ctrl+Shift+T from the sidebar) in real VS Code.
- **Also built 2026-11-09:** explicit "פתיחה בעורך" button on tool rows, navigation chat cards, the cumulative "שינויים בשיחה" changes card (reset by `/clear`), `/` and `@` menus mid-sentence. Tests 287/287; unverified in real VS Code. Package I step 2 cancelled; `openDiff` closed 2026-11-09 as redundant; plan-approval buttons dropped 2026-11-09 (`ExitPlanMode` did not arrive; `dev/must-check.txt` section 3). The detailed user check file is `dev/must-check.txt`. Details: `CHANGELOG.md`, `DECISIONS.md` 2026-11-09.
- **Built 2026-11-09 (English model text):** editor context now goes as the official extension's `<ide_opened_file>` / `<ide_selection>` text blocks before the user's text; all extension-written model text is English. Tests 302/302, verify-agent GO; unverified in real VS Code. The IDE server was removed the same day (next bullet).
- **Removed 2026-11-09 (IDE server, user decision):** `src/ide/` (WebSocket server, lock file, `CLAUDE_CODE_SSE_PORT`), the settings `claudeLocal.ideServer` / `ideServerVerboseLog`, the log tag `ide`, `test/ws-frames.test.js`, `test/ide-server.test.js`, `dev/check-ide-server.txt`. Why: CLI 2.1.246 never connected to it, editor context goes as text blocks, `openDiff` was redundant (`DECISIONS.md` 2026-11-09). The extension writes no files again. Tests 286/286.
- **Work-machine check 2026-11-09 (open):** the English editor context works in real use; the model switch to `qwen2.5-coder:7b` works, but the context window stays 64000 while the model's real window is 32,768: bug; fixed in code 2026-11-24 by the window per model (see below; unconfirmed on the work machine) (`PLAN.md` section 6 item 2, `DEPENDENCIES.md` row 44). The usage card fix 5213221 is not installed there.
- **Open for the user, not decided (the older "next" step is replaced by "Next steps" below):** the approve-and-implement proposal and the `/plan open` fallback (`FUTURE_FEATURES.md` 4.3g).

## Product proposal review (2026-11-17)
- `PRODUCT_PROPOSAL.md` (Hebrew, research only, no code changed): comparison with the official extension 2.1.322, CLI control requests the extension does not use yet, about 45 proposals with ids, appendix A = the absorbed 2026-11-10 review.
- **Decided by the user 2026-11-17 (`PLAN.md` section 11; `M-1`, `R-1` and `L-1` built since, see below):** direction = best front for a local slow/weak model plus `M-1` and `R-1`; `M-1` (editor diagnostics to the model: a nav-server tool plus new diagnostics with the next message) is top of the queue; `R-1` (always-visible per-block buttons, QuickPick removed, CodeLens kept); `L-1` indicator only (no keep-warm request from the extension); the control-request probe is to be written in a separate session; the CLI upgrade waits for its results.
- **Probe written 2026-11-17, not yet run:** `dev/probe5-standalone.js` (delivery copy `.txt`, Hebrew steps `dev/check-control-requests.txt`); tested only against the fake CLI. The hook answer format and `"type":"sdk"` in `--mcp-config` are assumptions the run will settle (`CHANGELOG.md`).
- **Probe run 2026-11-17 on the work machine (`DEPENDENCIES.md` row 45):** on CLI 2.1.246 `side_question`, `get_plan`, `background_tasks`, `get_settings`, `apply_flag_settings`, hooks (`hook_callback` arrives), SDK MCP (`mcp_message`, both declarations) and `appendSystemPrompt` work; the six dialog/export/task-output requests do not. Open: the hook answer's `additionalContext` did not show in the model's reply. CLI upgrade: **no, decided by the user 2026-11-17; stay on 2.1.246.**
- **Built 2026-11-23 (uncommitted at the time of writing; unit tests 316/316, verify-agent GO after one NO-GO round; NOT run in real VS Code or the real CLI):** `M-1` both parts: the ninth nav tool `getDiagnostics` and the `<ide_diagnostics>` block with the next message (`src/tagging/diagnostics.js`, `diagnostics-vscode.js`; `spec.md` "File tagging"; `PLAN.md` section 11). The two bugs from the 2026-11-17 re-read are closed: `lastContextSent` is also reset on `status: compacting` and on a typed `/compact`; `replay-log.js` is size-capped (2,000 items / 2,000,000 chars; no Hebrew marker; the up-arrow history also loses messages older than the cap). The cap and diagnostics values were chosen at build time, not by the user.
- **Open after 2026-11-23 (all in `spec.md` "Verification status"):** baseline timing in auto/bypass modes; whether `onDidChangeDiagnostics` fires for a file edited on disk and not open, and whether the 1.5 s settle wait is enough; real diagnostic shapes; that the CLI accepts the `<ide_diagnostics>` block; that `compacting` is emitted for manual and automatic compaction; the ninth tool in real VS Code (`dev/nav-check` expects 9 tools, not extended or re-run). The same-turn `PostToolUse` hook upgrade is pending (the hook answer format is not settled).
- **R-1 built 2026-11-24 (unit-tested only; not seen in real VS Code or the real CLI):** per-block approval now uses comment threads on the proposed side (`src/diff/block-comments.js`, `block-state.js`), editor-title accept-all / reject-all, cancel in the overflow menu, and cursor commands in the palette. Blocks start pending and the decision is sent automatically when the last is decided. Above 100 blocks there are no threads. The QuickPick is removed and CodeLens stays for `diffEditor.codeLens` users. Deviation: a cancel button was added. Open: the real-VS-Code checks in `spec.md` "Verification status" and `dev/must-check.txt` 7.6.2.
- **Window per model, L-1 and telemetry-off built 2026-11-24 (merged with R-1; whole suite 403/403; unit-tested only):** window per model from Ollama `/api/ps` (`src/models/ollama.js` in-memory cache; `launch.js` `pickLaunchWindow` explicit|cached|fallback; context-meter gauge max = real window). This closes the 2026-11-09 window bug (`qwen2.5-coder:7b` stuck on 64000) in code, not yet confirmed on the work machine. The per-model setting and the gateway `max_input_tokens` were dropped (user). L-1 indicator is inside the `context` message. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is the default in `src/cli/env.js` (unverified on 2.1.246). Decisions: `DECISIONS.md` 2026-11-24 x3.
- **M-3 built 2026-11-24 (unit-tested only; suite 410/410; verify-agent GO after one NO-GO round; NOT run in real VS Code or the real CLI):** the English guidance toward the nav tools goes through `appendSystemPrompt` in `initialize` (`src/mcp/nav-guidance.js`), only when the nav server started and the new setting `claudeLocal.navGuidance` (default on, user decision, applies from a new conversation) is on. Deviation: the first build deferred `initialize` behind a `navReady` promise; verify showed a user message could reach the CLI first, so `request()` now takes a lazy function payload and `initialize` is strictly first. Limits: text fixed per conversation (an MCP-panel toggle mid-conversation does not change it). Open user checks: the lines arrive on CLI 2.1.246, and the before/after count of `mcp__claude-local-nav__*` calls against `Grep`/`Read` (`dev/must-check.txt` 6.4). Decision: `DECISIONS.md` 2026-11-24.
- **Known limits of the window work:** cold start (model not loaded) runs on the last seen value or 64,000 until the first result (then a notice); a user value of exactly 64000 is not "explicit"; Open in Terminal keeps the package.json value; an OS-level `DISABLE_NONESSENTIAL_TRAFFIC` is overridden; the gauge shows the real window even with an explicit user window.

## User answers to the open questions of 2026-11-09 (given 2026-11-24; all closed)
- External components usable in both extensions: yes, recorded as an undecided idea in `FUTURE_FEATURES.md` section 6.
- Telemetry: decided and built (`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`; unverified on 2.1.246).
- `ExitPlanMode` plan-approval buttons: kept in the code for a stronger model.
- `dev/must-check.txt` sections 4 and 5: the user chose to leave them open; they are not marked skipped.
- The nav toggle at 22:47:26 was intentional.
- The agent's marks in `dev/must-check.txt` are confirmed correct; 7ב step 9 stays unreported.

## Next steps
- The user runs the real-VS-Code checks for R-1, the context window per model and L-1 (`spec.md` "Verification status"; `dev/must-check.txt` 7.6.2).
- The `M-1` same-turn `PostToolUse` hook upgrade is still pending (the hook answer format is not settled). The user also still checks M-1 in real VS Code with the real CLI.
- Review the remaining `PRODUCT_PROPOSAL.md` items one by one with the user (P-1, P-2, P-3 are feasible on 2.1.246; M-3 was chosen and built 2026-11-24). The user also runs the M-3 checks (`dev/must-check.txt` 6.4).

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser UI preview: `.claude/launch.json` "chat-preview".
- Working agreements with the user:
  - Decisions are asked one at a time with all implications (cost, pros, cons). When the user only asks a question, change no files.
  - Findings and changes go into the matching document, not only into the chat.
  - The user's machine has no GitHub access: anything meant to run there is delivered as a self-contained file; results come back as pasted text or screenshots.
  - Checks against the real CLI and model are run by the user from commands prepared here; scripts are tested first against `dev/fake-claude.js` (`dev/README.md`).
- Git: `git-instructions.md` (work on `develop`, one commit per task, stage specific files).
