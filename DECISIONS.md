# Decisions — Claude Code Local (basic version)

User decisions were made through AskUserQuestion on 2026-10-29/30 and are recorded here as given. Entries marked "spec default" were filled in by the spec writer where the decisions were silent; they are not user decisions and can be changed.

## [2026-10-30] Start fresh and small in this repo
**Decision:** Build a new, small "basic version" in this repo. The older OneDrive project's code is a reference for ideas only.
**Alternatives considered:** Continue the old project and run its never-executed code; follow `plan.md`'s four milestones (M1-M4) as written.
**Why:** The old code was never run; the user wants something that works first, with design invested, and a narrower scope than the old M1.

## [2026-10-30] Strict source of truth: the extension stores no data
**Decision:** The extension writes nothing of its own: no `globalState` / `workspaceState`, no files, no archive, groups, unread flags, local renames, or reload-restore state. History is read read-only from the CLI's transcripts `~/.claude/projects/<encoded cwd>/*.jsonl` (`CLAUDE_CONFIG_DIR` respected; cwd encoded by replacing every non-alphanumeric character with `-`). A past chat is shown by reading its jsonl and continued with `--resume <id>`. Commands/skills, models and agents come from the CLI's `initialize` control response (verified with CLI 2.1.181).
**Alternatives considered:** Keep extension-side metadata as the older spec did (archive, groups, titles, unread in `globalState`); let the GUI cache a copy of conversations.
**Why:** The CLI must be the only source of truth and the GUI only a front for the real program; a second store can drift from the CLI's.

## [2026-10-30] UI language and layout: Hebrew RTL mirroring the official design
**Decision:** `dir="rtl" lang="he"`; layout mirrors the official extension. Code, paths and commands are LTR islands; message paragraphs use `dir="auto"`.
**Alternatives considered:** English LTR UI like the official extension; a single global direction with no per-paragraph detection.
**Why:** Same as the older spec; `dir="auto"` keeps English replies readable inside an RTL shell.

## [2026-10-30] Rendering: vendored plain-JS libraries allowed
**Decision:** `marked` and `highlight.js` (common-languages bundle) are saved as pinned plain-JS files with license files under `webview/vendor/`. Everything else is hand-written plain JS (CommonJS in the host, plain scripts in the webview). No TypeScript, no `npm install`, no build step, no runtime network.
**Alternatives considered:** A fully hand-written Markdown renderer and highlighter; an npm-based build with a bundler.
**Why:** Complete Markdown and code coloring is the core of "render all formatting"; hand-writing it is large and error-prone, while vendored files keep the offline, no-build constraint. Raw HTML from Markdown is escaped because `marked` does not sanitize.

## [2026-10-30] One long-lived CLI process per conversation over stream-json
**Decision:** `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio --permission-mode <mode>` (+ `--resume <id>`, `--model <m>`), with the control protocol on stdio (`initialize`, `interrupt`, `set_permission_mode`, `set_model`; incoming `can_use_tool`). `.cmd` paths run through `cmd.exe`. The stop button sends `interrupt`.
**Alternatives considered:** One short process per message (`claude -p` each turn); running the CLI in a terminal and scraping it.
**Why:** The control protocol gives streaming, permissions, interrupt and live mode/model changes from the real program without parsing terminal output.

## [2026-10-30] Placement: editor tab and secondary-sidebar view, independent conversations
**Decision:** An editor-tab `WebviewPanel` (editor/title button, Ctrl+Shift+Esc, status-bar "✻ Claude") and a sidebar view in the secondary sidebar (activity-bar fallback on old VS Code). Each has its own process. Ids renamed (`claude-local.*`, `claudeLocal.*`, `claudeLocal*`) so it installs next to the official extension.
**Alternatives considered:** Only a tab; only a sidebar view; sharing one conversation between both surfaces.
**Why:** Matches the official extension's two main surfaces; independent processes avoid shared state.

## [2026-10-30] Permissions: relay cards and a mode selector
**Decision:** Permission cards for `can_use_tool` ("אישור" / "אישור תמיד" when `permission_suggestions` arrive / "דחייה"), and a mode selector: ידני=`default`, עריכה אוטומטית=`acceptEdits`, תכנון=`plan`, ללא הרשאות=`bypassPermissions` only when `claudeLocal.allowDangerouslySkipPermissions` is on, via `set_permission_mode`.
**Alternatives considered:** Always start in `bypassPermissions`; own permission rules kept in the extension.
**Why:** The CLI decides, the extension only relays; own rules would be a second source of truth.

## [2026-10-30] History as a button + searchable list; skills as a `/` menu
**Decision:** A "past conversations" button at the top of the chat opens a searchable list grouped היום / אתמול / קודם; no separate activity-bar sessions panel. Skills/commands are a `/` menu in the composer (from `initialize`), filtered as you type; no separate skills button.
**Alternatives considered:** An activity-bar sessions panel as in the official extension; a dedicated skills button.
**Why:** Smallest surface that gives the user history and skills; the sessions panel pulls in archive/groups/state that the no-storage rule forbids anyway.

## [2026-10-30] Thread content and settings kept minimal
**Decision:** The thread shows user messages, streamed Markdown text (code with copy button and highlighting), collapsed thinking, tool rows (name + one-line summary, expandable), a result line (duration/cost/tokens when given), Hebrew errors, and a model picker (`initialize` models -> `set_model`). Settings: `claudeLocal.claudePath` and `claudeLocal.allowDangerouslySkipPermissions`; plus `claudeLocal.useCtrlEnterToSend` (spec default: the user said "maybe"; included because it is a one-line setting).
**Alternatives considered:** The older spec's 24 settings; no settings at all.
**Why:** Only what the basic version uses; VS Code settings are user configuration, not conversation data.

## [2026-10-30] Out of scope for this milestone
**Decision:** Native diff review, editor context / @-mentions / Alt+K, IDE MCP tools and WebSocket server, terminal mode, walkthrough, the sessions activity-bar list, archive / groups / rename, reload restore are left to later milestones.
**Alternatives considered:** Keeping the older M1-M4 scope.
**Why:** The user asked for a working basic version first.

## [2026-10-30] Testing on this machine
**Decision:** Automated `node --test test/` with a `dev/fake-claude.js` stream-json fake CLI; manual checks in the Extension Development Host against the real CLI (this machine has VS Code, Node 22 and the real `claude`).
**Alternatives considered:** Fake-CLI-only testing as on the older machine.
**Why:** The real CLI is available, so protocol shapes can be captured instead of assumed.

## [2026-10-30] Spec defaults filled in by the spec writer (not user decisions)
**Decision:**
- A past conversation opens in the current panel only when that panel has no messages and no running turn; otherwise it opens in a new editor tab. The same session already open in this window is focused instead.
- "New conversation" is disabled while a turn runs.
- No `WebviewPanelSerializer`: after a window reload tabs are not restored (consequence of the no-storage rule).
- `ExitPlanMode` gets a plan card (needed for plan mode); `AskUserQuestion` is a generic card in this milestone.
- No capability probing of the CLI (`--version`/`--help`); fixed target CLI 2.1.181+.
- The list shows title and last activity only (no message count).
**Alternatives considered:** Always replacing the current conversation when opening history; killing a running turn on "new conversation"; restoring tabs from a persisted session id; full `AskUserQuestion` option picker now; per-path capability cache.
**Why:** Avoid losing a running turn, honour the no-storage rule, keep the first milestone small. Revisit any of these if the user disagrees.
(Update 2026-10-30: the `AskUserQuestion` default was reversed during the build, see the next entry.)

## [2026-10-30] AskUserQuestion gets a real option picker in this milestone
**Decision:** The question card shows the options and answers with `allow` + `updatedInput: {...input, answers}`, answers keyed by question text. This replaces the spec default of a generic card.
**Alternatives considered:** A generic permission card (allow/deny only); denying the tool with a message.
**Why:** A plain "allow" returns no answers, so Claude's question would be lost and the card would be useless. Spec-writer/builder decision, not asked of the user.

## [2026-10-30] bypassPermissions needs a launch flag
**Decision:** When `claudeLocal.allowDangerouslySkipPermissions` is on, `buildArgs` adds `--allow-dangerously-skip-permissions` at launch. A failed `set_permission_mode` / `set_model` shows a Hebrew notice and the UI keeps its previous value.
**Alternatives considered:** Only send `set_permission_mode: bypassPermissions` at runtime; start in `bypassPermissions` via `--permission-mode`.
**Why:** Verified against the real CLI 2.1.181: a later switch to bypass is rejected unless the process was started with that flag. Starting in bypass would remove the safe default.

## [2026-10-30] Stop never hangs and never shows an error
**Decision:** Stop = deny pending cards, send `interrupt`, show "■ הופסק". If no `result` arrives within 4 s of the interrupt acknowledgement the turn is closed locally; a process still alive after 6 s is killed (`taskkill /T /F`).
**Alternatives considered:** Wait for the CLI's `result` only; kill the process immediately.
**Why:** Killing at once loses the process (and its session continuity); waiting forever can leave the stop button stuck. Real CLI behaviour after `interrupt` is not yet verified (CLI not logged in).

## [2026-10-30] Small build-time deviations kept
**Decision:** (1) History groups are היום / אתמול / השבוע / קודם. (2) No `icon` in `package.json` (no PNG; the SVG is used for commands and containers). (3) Ctrl+Shift+Esc stays as specified although Windows normally takes it for Task Manager. (4) `engines.vscode` stays `^1.94.0` while the secondary sidebar is used from 1.106 (the official extension's threshold). (5) `scripts/package.ps1` is deferred. (6) A dev-only browser preview (`dev/preview-*`) was added to check the UI without VS Code.
**Alternatives considered:** Keep the spec's three groups; draw a PNG icon now; pick another default key; raise `engines` to 1.106; build packaging now; test the UI only inside VS Code.
**Why:** "השבוע" reads better for the weekly range; the others avoid scope creep or keep to the spec. The shortcut conflict is flagged as a known limit rather than silently changed.

## [2026-11-01] Feature roadmap taken from the official extension's guide
**Decision:** The user went through the official extension's 24 feature areas (`docs/claude-code-vscode-guide-he.html`) one by one via AskUserQuestion and decided each; the full record is `docs/features-plan.md`. Summary: add entry points (Open in Terminal, sessions in the activity bar), the prompt-box features (auto mode, grouped `/` menu, file mentions, images, copy, context meter, message queue), editor context and diff review, session filters/rename/reopen, checkpoints and background tasks, MCP management, display and accessibility settings, user-rebindable shortcuts. Skipped: cloud-only features (Remote Control, voice, Web tab, Chrome for now), plugins/Mods, archive and session groups (the no-storage rule stays), prompt-cache timer, bookmarks.
**Alternatives considered:** Copy every feature of the official extension; add only what is cheap; keep the basic version unchanged.
**Why:** The machine is offline with a local model and the extension keeps no data of its own, so features that need Anthropic's cloud or extension-side storage do not apply. Items that depend on unverified CLI behaviour were marked "check against the real CLI first", and the checks were run on 2026-11-01 (see `docs/features-plan.md`, `AGENT_CONTEXT.md`).

## [2026-11-01] Extension runs the real binary and supplies the CLI environment itself
**Decision:** `claudeLocal.claudePath` must point to `claude-bin.exe`, not to the `claude.cmd` wrapper; the extension's `environmentVariables` setting will carry `API_TIMEOUT_MS`, `CLAUDE_ENABLE_STREAM_WATCHDOG` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS`.
**Alternatives considered:** Point `claudePath` at the wrapper; feed the wrapper its model choice on stdin; leave the timeouts at their defaults.
**Why:** The wrapper asks "Select model number" before every run (verified on the user's machine), which would stall the stream-json process; the CLI does not recognise the local model, so it assumes a 200k window and its default timeouts are too short for a slow local model. Spec-writer decision based on observed behaviour, to be confirmed by the user.
