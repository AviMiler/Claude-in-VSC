# Agent context — Claude Code Local

Short session brief. Facts live in one place each: behavior `spec.md`, decisions `DECISIONS.md`, roadmap/status/open points `PLAN.md`, history `CHANGELOG.md` (older: `CHANGELOG-archive.md`, not read by sessions).

## Read first
- `spec.md` (as built + "Verification status"), `DECISIONS.md`, `PLAN.md` (single source of truth for what to build next), `ARCHITECTURE.md`, `PROJECT_MAP.md`, `DEPENDENCIES.md` (vendored libs, measured CLI/gateway/Ollama/VS Code findings), `FIXES.md` (open user-reported problems; read before changing conversation placement or UI).
- `git-instructions.md`, `SETUP.md` (Hebrew, user's machine), `dev/README.md`, `FUTURE_FEATURES.md`.

## What this is
VS Code extension (plain JS, no build, no npm): Hebrew RTL front for the real `claude` CLI (CLI 2.1.246, VS Code 1.91.1, local model behind a LiteLLM gateway). The CLI is the only source of truth: no persistence (no globalState/workspaceState/own files), history read-only from `~/.claude/projects/<encoded cwd>/*.jsonl`.

## Constraints (mandatory)
- **GUI only for the CLI (user, 2026-11-24).** Show and send only what comes from the CLI (stream events, control requests, flags, commands, files). Features originating in the extension are not planned or built.
- **No internet on the user's machine.** Files can be brought in (self-contained, see below). No network installs (npm, marketplace, package managers, runtime fetching). Vendor plain files under `webview/vendor/` only as a last resort after VS Code APIs, Node built-ins, the CLI, hand-written code; record each exception in `DEPENDENCIES.md`. When proposing a feature, say first what it needs from outside the repo.
- **Model-bound text is English (user, 2026-11-09).** All text the extension sends to the CLI/model (context blocks, deny/reject results, placeholders, injected prompts) is English; only the user's own typed text may differ; UI stays Hebrew.
- Docs are English; user-facing strings and every question to the user are Hebrew (exception: `SETUP.md`).
- No persistence, no build step, no writing to the CLI's transcripts.
- Push only when the user asks. Never stage the untracked `שליחה` zip/folder.
- Files for the user to run: self-contained TXT, UTF-8 with BOM and CRLF.

## Models (user, 2026-11-09)
Pick model and effort per task/subagent by real difficulty: trivial edits → Haiku or Sonnet low; ordinary code and checks → Sonnet medium; hard or risky work (hard-to-verify protocol changes, tricky concurrency, broad cross-cutting) → Opus. Fable is not used.

## Subagent and session limits (mandatory; after a 4.1M-token Opus run, 2026-11-05)
- **No environment hunting.** If `node` is missing or a check cannot run: STOP, report what and the exact command for the user. No disk search for runtimes, no ad-hoc harnesses.
- **Install nothing** (winget/choco/npm/pip, downloads, services) without asking.
- **Budget in the brief:** state a call limit (default 40 tool calls for a small fix); at the limit commit what is done and report.
- **Small reads:** line ranges, never dump a changelog/transcript; load only the skills the stage needs.
- **No waiting** on timers, servers or browser pages; a background agent reports in its final message.
- **Split big work** into short agents (build, then docs), not one agent past 200k tokens.

## Last changes (newest first; details in CHANGELOG.md)
- 2026-11-24 P-3: "לרקע" button on a running Bash tool (`background_tasks {tool_use_id}`); suite 424/424, unit-tested only; the real CLI answer on a running tool is unverified.
- 2026-11-24 Q-8: `/claudemd` and command `claude-local.openClaudeMd` open the project `CLAUDE.md` or offer to create it (no token count); suite 423/423, unit-tested only.
- 2026-11-24 Q-6: live status-bar item (working + timer / waiting / finished) from `status-summary.js`; suite 420/420, unit-tested only.
- 2026-11-24 Q-5: focus view toggle (`/focus`, command `claude-local.focusView`, Ctrl+Alt+F in the chat); task list and running tool stay visible; suite 413/413, unit-tested only.
- 2026-11-24 Q-7: settings `chatFontSize` / `codeFontSize` (0 = follow VS Code); suite 412/412, unit-tested only.
- 2026-11-24 Q-1: setting `claudeLocal.defaultPermissionMode` (start mode of a new conversation, `--permission-mode`); suite 411/411, unit-tested only.
- 2026-11-24 docs: GUI-only rule recorded; rejected proposals removed from `PRODUCT_PROPOSAL.md`.
- 2026-11-24 docs: `PLAN.md` trimmed to gaps against the official extension.
- 2026-11-24 dev: VSIX build script.
- 2026-11-24 M-3: nav-tool guidance via `appendSystemPrompt` (setting `claudeLocal.navGuidance`); suite 410/410, unit-tested only.
- 2026-11-24 R-1 (per-block approval via comment threads), window per model, L-1, telemetry off; suite 403/403, unit-tested only.

## Next steps (detail: `PLAN.md`, `spec.md` "Verification status", `dev/must-check.txt`)
- User runs real-VS-Code checks: R-1, window per model, L-1 (`dev/must-check.txt` 7.6.2) and M-3 (6.4).
- Everything is unverified in real VS Code and the real CLI; open checks in `dev/open-checks.txt`.
- Build queue (user, 2026-11-24, `PLAN.md` section 11 "Review under the GUI-only rule"): P-3, Q-1, Q-5, Q-6, Q-7, Q-8 (open only), Q-9, R-2; R-4, M-4, X-3 only after a CLI 2.1.246 check; M-6, X-4, Q-4 wait for a CLI upgrade; 4.1g is a check file only; infrastructure A-1, A-2. Rejected: P-1 (`/btw` stays a separate process), P-2/4.3g. Already-built extension features stay.
- M-1 same-turn hook upgrade is rejected (GUI-only rule); CLI upgrade: no (stay on 2.1.246).

## How to work here
- Tests: PowerShell, `node --test "test/*.test.js"` (Node 22 needs the glob). Node is not on the Bash PATH.
- Run: `code --extensionDevelopmentPath=<repo>`; `claudeLocal.claudePath` can point to `dev/fake-claude.cmd`. Browser preview: `.claude/launch.json` "chat-preview".
- Working agreements: decisions asked one at a time with all implications (cost, pros, cons); a pure question changes no files; findings and changes go into the matching document, not only the chat; the user's machine has no GitHub access, so anything meant to run there is a self-contained file and results come back as pasted text/screenshots; checks against the real CLI/model are run by the user from prepared commands, scripts tested first against `dev/fake-claude.js`.
- Git: `git-instructions.md` (work on `develop`, one commit per task, stage specific files).
