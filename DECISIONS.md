# Decisions — Claude Code Local (basic version)

User decisions were made through AskUserQuestion on 2026-10-29/30 and are recorded here as given. Entries marked "spec default" were filled in by the spec writer where the decisions were silent; they are not user decisions and can be changed.

## [2026-10-30] Start fresh and small in this repo
**Decision:** Build a new, small "basic version" in this repo. The older OneDrive project's code is a reference for ideas only.
**Alternatives considered:** Continue the old project and run its never-executed code; follow the older four-milestone plan (M1-M4; since removed from the repo) as written.
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
**Decision:** `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio --permission-mode <mode>` (+ `--resume <id>`, `--model <m>`), with the control protocol on stdio (`initialize`, `interrupt`, `set_permission_mode`, `set_model` (superseded for model switching by the 2026-11-01 restart decision); incoming `can_use_tool`). `.cmd` paths run through `cmd.exe`. The stop button sends `interrupt`.
**Alternatives considered:** One short process per message (`claude -p` each turn); running the CLI in a terminal and scraping it.
**Why:** The control protocol gives streaming, permissions, interrupt and live mode/model changes from the real program without parsing terminal output.

## [2026-10-30] Placement: editor tab and secondary-sidebar view, independent conversations
**(Superseded 2026-11-02 by "Fix 1: one place" below; kept for the history.)**
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
- A past conversation opens in the current panel only when that panel has no messages and no running turn; otherwise it opens in a new editor tab. The same session already open in this window is focused instead. **(Superseded 2026-11-02: it now opens in the same place, in a new conversation if the current one is not empty.)**
- "New conversation" is disabled while a turn runs. **(Reversed by the user on 2026-11-02, see the Fix 1 entries at the end.)**
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
**Why:** Killing at once loses the process (and its session continuity); waiting forever can leave the stop button stuck. Real CLI behaviour after `interrupt` was verified on 2026-11-01: the `result` arrives in about 0.5 s and the process stays alive, so the 4 s wait is only a fallback.

## [2026-10-30] Small build-time deviations kept
**Decision:** (1) History groups are היום / אתמול / השבוע / קודם. (2) No `icon` in `package.json` (no PNG; the SVG is used for commands and containers). (3) Ctrl+Shift+Esc stays as specified although Windows normally takes it for Task Manager. (4) `engines.vscode` was `^1.94.0` at build time and was lowered to `^1.91.0` on 2026-11-01 (VS Code 1.91.1 would not load it); the the secondary sidebar is used from 1.106 (the official extension's threshold). (5) `scripts/package.ps1` is deferred. (6) A dev-only browser preview (`dev/preview-*`) was added to check the UI without VS Code.
**Alternatives considered:** Keep the spec's three groups; draw a PNG icon now; pick another default key; raise `engines` to 1.106; build packaging now; test the UI only inside VS Code.
**Why:** "השבוע" reads better for the weekly range; the others avoid scope creep or keep to the spec. The shortcut conflict is flagged as a known limit rather than silently changed.

## [2026-11-01] Feature roadmap taken from the official extension's guide
**Decision:** The user went through the official extension's 24 feature areas (`dev/claude-code-vscode-guide-he.html`) one by one via AskUserQuestion and decided each; the full record is `PLAN.md`. Summary: add entry points (Open in Terminal, sessions in the activity bar), the prompt-box features (auto mode, grouped `/` menu, file mentions, images, copy, context meter, message queue), editor context and diff review, session filters/rename/reopen, checkpoints and background tasks, MCP management, display and accessibility settings, user-rebindable shortcuts. Skipped: cloud-only features (Remote Control, voice, Web tab, Chrome for now), plugins/Mods, archive and session groups (the no-storage rule stays), prompt-cache timer, bookmarks.
**Alternatives considered:** Copy every feature of the official extension; add only what is cheap; keep the basic version unchanged.
**Why:** The machine is offline with a local model and the extension keeps no data of its own, so features that need Anthropic's cloud or extension-side storage do not apply. Items that depend on unverified CLI behaviour were marked "check against the real CLI first", and the checks were run on 2026-11-01 (see `PLAN.md`, `AGENT_CONTEXT.md`).

## [2026-11-01] Sessions list (package B1): rename through the CLI, scoped Ctrl+Shift+T
**Decision:** The Activity Bar sessions list supersedes the 2026-10-30 "no separate sessions panel" decision. Rename sends `/rename <title>` as ordinary user text (a closed session is resumed first), so the CLI writes the title and the extension never writes a transcript. Ctrl+Shift+T is bound only when `claude-local:hasClosed && (activeWebviewPanelId == 'claudeLocalPanel' || activeEditor == '')`. Tab markers (blue = waiting for permission, orange = finished while hidden) are an emoji prefix in the panel title, in memory only.
**Alternatives considered:** Writing the custom title into the jsonl ourselves; renames kept in the extension (storage); binding Ctrl+Shift+T unconditionally; colour via API (none exists in VS Code).
**Why:** The CLI must stay the only writer and the only store. The `when` clause leaves VS Code's own "reopen closed editor" working for files. Not yet tried against the real CLI or VS Code.

## [2026-11-01] Extension runs the real binary and supplies the CLI environment itself
**Decision:** `claudeLocal.claudePath` must point to `claude-bin.exe`, not to the `claude.cmd` wrapper; the extension's `environmentVariables` setting will carry `API_TIMEOUT_MS`, `CLAUDE_ENABLE_STREAM_WATCHDOG` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS`.
**Alternatives considered:** Point `claudePath` at the wrapper; feed the wrapper its model choice on stdin; leave the timeouts at their defaults.
**Why:** The wrapper asks "Select model number" before every run (verified on the user's machine), which would stall the stream-json process; the CLI does not recognise the local model, so it assumes a 200k window and its default timeouts are too short for a slow local model. Confirmed by the user on 2026-11-01 (decision 5 below).

## [2026-11-01] Six open decisions closed by the user, one by one (AskUserQuestion)
**Decision:**
1. **Model list source:** the extension fetches the model list from the gateway (`GET /v1/models`, in memory only, read-only). This relaxes the spec rule "no network from the extension" for the user's own internal gateway; the address comes from `ANTHROPIC_BASE_URL` (environment or the CLI's `settings.json`, read-only) or a new `claudeLocal.gatewayUrl`. If the gateway is unreachable the picker falls back to the current model.
2. **`!` shell mode:** dropped. A `!command` line is sent as ordinary text and the model interprets it as before.
3. **Auto permission mode:** added to the mode picker with a Hebrew warning that the CLI decides on its own (classifier running on the local model).
4. **Model switch:** restart the CLI process with `--model <id>`, the three `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` variables set to the same id, and `--resume <session>` to keep the conversation. No runtime `set_model`.
5. **Launching the CLI:** `claudeLocal.claudePath` points at `claude-bin.exe`; the extension adds `API_TIMEOUT_MS=1200000`, `CLAUDE_ENABLE_STREAM_WATCHDOG=0` and `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000` (default of a new `claudeLocal.environmentVariables` setting that the user can edit). Connection variables stay in the CLI's `settings.json`.
6. **Model filtering:** models whose gateway config has `extra_body.output_config.format` (forced JSON title output: `qwen2.5-coder:7b`, `gemma4:31b`) are hidden automatically; a new `claudeLocal.modelDenylist` (default `gemma3:27b`, which rejects tools) is user-editable; a "does not support tools" error during a chat shows a Hebrew message and returns to the previous model.

## [2026-11-01] Background tasks (package B2): no "move to background" button (pending the user's decision)
**Decision:** a task map with a stop button only (`system/task_started`, `background_tasks_changed`, `task_updated`, `task_notification`; stop through `stop_task {task_id}`). No "move to background" button. `PLAN.md` row 73 is left unchanged until the user decides.
**Alternatives considered:** the button the plan asked for, through `background_task`, `move_to_background`, `background_current_tool` or `list_tasks`.
**Why:** probe4 (CLI 2.1.246) answered all four with "Unsupported control request subtype", so the button cannot be built.
**Alternatives considered:** a user-owned helper script or a manual list for the model list; implementing `!` in the extension; leaving auto mode as a hidden setting; runtime `set_model`; keeping the `claude.cmd` wrapper (with an edited non-interactive mode); an allowlist or no filtering for models.
**Why:** the gateway is the single source of truth for models and is already required by the CLI; capability flags in the gateway are unreliable; the wrapper prompts interactively and would stall the stream-json process; a restart with `--resume` is the only model switch verified against the real CLI, and keeps the session title model aligned (avoids loading two models, a cold load was measured at 285 s). See `PLAN.md` and `DEPENDENCIES.md`.

## [2026-11-01] The message queue is client-side, not the CLI's `interrupt_cancel_queued_v1`
**Decision:** A message typed while a turn runs is held in memory in the webview (`createQueue` in `webview/chat/prompt-logic.js`, used by `composer.js`) and shown as a grey "ממתין" bubble with a cancel button. It is sent to the CLI only when the previous turn ends (the `result` event / `busy:false` triggers `sendNextQueued`), one message at a time. The CLI's own queue and its `interrupt_cancel_queued_v1` control message are not used. A new or loaded conversation starts with an empty queue.
**Alternatives considered:** Send the message to the CLI at once (the CLI queues it, verified in `DEPENDENCIES.md` finding 8) and cancel it with `interrupt_cancel_queued_v1`.
**Why:** Cancelling a message that has not been sent only means removing it locally, so the queue stays visible and cancellable with no dependency on a control message whose exact shape was never captured (control-protocol work is Opus-model territory, `AGENT_CONTEXT.md`). Cost: a queued message is not in the CLI yet, so it is lost if the process dies or the panel closes before it is sent. `PLAN.md` originally named `interrupt_cancel_queued_v1`; this entry replaces that.
## [2026-11-01] Display and accessibility (package G): inferred semantics (not asked of the user)
**Decision:** `PLAN.md` fixed only the setting names and defaults, so the build chose: (1) focus view hides tool rows, thinking, the result line and the per-answer actions, leaving user and Claude text; (2) `colorMode: daltonized` overrides the status colours with the Okabe-Ito palette through CSS variables; (3) reduced motion is the setting OR the OS media query `prefers-reduced-motion`; (4) a non-empty `spinnerVerbs` replaces the default verbs, empty keeps them; (5) timestamps are shown in the speaker heading and not for messages loaded from history (no reliable time); (6) the thread's `aria-live` is switched off and a separate polite `role="status"` announcer speaks only turn start/end, permission requests and errors.
**Alternatives considered:** focus view as hiding the header and composer chrome; a custom hand-picked colour-blind palette; reduced motion by the setting only; extending the default verbs with the user's; leaving `aria-live="polite"` on the thread; timestamps on history messages from the transcript file time.
**Why:** a polite live region on the whole thread reads every streamed token, which is unusable; Okabe-Ito is a published colour-blind-safe palette, so no palette had to be invented; honouring the OS preference is the accessibility default. Open for the user to change, since none of it was explicitly decided. Screen-reader behaviour is untested (`PLAN.md` says it needs a real screen reader).

## [2026-11-02] Fix 1: one place for the chat, sidebar by default (user decision)
**Decision:** The chat has one place, chosen by `claudeLocal.preferredLocation`, whose default is now `sidebar`; `panel` (ONE editor tab, never duplicated) stays an option. Every entry point (editor-title button, status bar, Ctrl+Alt+C, Ctrl+Shift+Esc, URI) goes through `places.main()` and reveals/focuses that place. Commands `editor.open`, `editor.openLast` and `sidebar.open` were replaced by the single `claude-local.open`.
**Alternatives considered:** the editor tab as the default; "focus the existing chat, else open beside" (placement depending on what is open); keeping several open commands.
**Why:** the user reported "3 different buttons" and an unpredictable place (FIXES F-1). One fixed place plus one entry point is predictable; the sidebar matches the official extension and keeps the editor free.

## [2026-11-02] Fix 1: "New conversation" replaces the view, the other keeps running (user decision; reverses the 2026-10-30 spec default)
**Decision:** "New conversation" is never refused. It creates a conversation in the same place and shows it; the previous one keeps running in the background (its CLI process is not interrupted). A permission request or question that arrives while hidden stays pending and is signalled (drawer dots, `view.badge`, tab title marker); a turn that ends unseen marks the conversation unread. This reverses "New conversation is disabled while a turn runs" (2026-10-30 spec defaults). Root cause of F-2: `Conversation.newConversation()` returned early when `busy`.
**Alternatives considered:** a separate panel (tab) per conversation; refusing while busy (the old behaviour); interrupting or killing the running conversation.
**Why:** a running turn must never be lost or stopped by a navigation action, and the user wanted one view hosting several conversations rather than several panels.

## [2026-11-02] Fix 1: a drawer instead of a popover or an Activity Bar tree (user decision)
**Decision:** The conversation list is a drawer opened by a ☰ button in the chat header, sliding in from the start side: filter (all / active / waiting / finished), search, open conversations with status dots, rename (through the CLI's `/rename`), close, and past conversations by day. The Activity Bar container `claude-local-history`, the `claudeLocalHistory` TreeView, the commands `history.open/refresh/filter/rename` and the header "שיחות קודמות" button were removed. This supersedes the 2026-11-01 "Sessions list (package B1)" UI; its rename-through-the-CLI and scoped Ctrl+Shift+T decisions stay.
**Alternatives considered:** the official extension's popover; keeping the Activity Bar tree next to the in-chat list.
**Why:** the tree only duplicated the list and added a second entry point, against the "one clear entry" goal; a drawer fits a narrow sidebar and shows status dots of hidden conversations in the place the user is already looking at.

## [2026-11-02] Fix 1: how several conversations share one webview (builder decision, constraints from the user's decisions)
**Decision:** A `ConversationHost` (outliving the `WebviewView`) holds the open `Conversation`s; one is attached to the webview. A hidden conversation records what it would have shown in an in-memory replay log (`replay-log.js`: streamed deltas folded per block, snapshots, agent cards merged); on a switch the webview is redrawn once from that log with a `restore` message. The composer's own state (draft, client-side queue, prompt history) is saved and restored per conversation; the queue of a hidden conversation is sent by the host when its turn ends.
**Alternatives considered:** one webview per conversation (a `WebviewView` is a single webview, so this would need hidden editor tabs or several views); keeping several conversation threads in the DOM of one webview and toggling them (every webview module assumes one thread, so it needs a rewrite of the thread, bars, cards and composer, and it makes the cost of hidden streaming grow with the DOM).
**Why:** replay-from-memory keeps one thread in the DOM, the streaming path unchanged (no whole-thread re-render per token), nothing persisted, and the change local to the host plus one `restore` handler.

## [2026-11-02] Fix 1: "stop and switch" folded into the model pill (builder decision)
**Decision:** During a turn the model pill itself performs "stop and switch" (same modal Hebrew warning, interrupt, switch when the turn ends). The separate "⏹ עצירה והחלפת מודל" chip and `model-picker.js` were removed. The mode picker stays disabled during a turn.
**Alternatives considered:** keeping the separate chip next to a disabled picker.
**Why:** one control instead of two in the narrow footer; behaviour unchanged. Not explicitly asked of the user.

## [2026-11-05] Navigation server config passed inline, not as a file (builder decision)
**Decision:** `--mcp-config` receives the server config as an inline JSON string (`claude-local-nav`, http on 127.0.0.1 with a Bearer token); no `--strict-mcp-config`. Unverified that CLI 2.1.246 accepts inline JSON; if it does not, a temp config file is needed as an explicit exception to "the extension writes no files", deleted on exit.
**Alternatives considered:** a temp config file (as the probe used); stdio through a helper script (passed the pre-check too).
**Why:** no file keeps the no-storage rule intact. Cost: the token is visible in the child's command line (loopback only, one process lifetime).

## [2026-11-02] Fix 1: context meter only displays; mascot icons (user decisions)
**Decision:** The context meter shows a percentage with a tooltip and no longer sends `/compact` on click (F-10; `/compact` stays as a typed command). The hand-drawn spark logo was replaced by the Claude Code mascot (`resources/claude-mascot.svg` full colour, `claude-mascot-mono.svg` `currentColor`); `claude-logo.svg` was deleted. The UI follows the official extension's look as closely as the guide and screenshots allow, VS Code theme variables only.
**Alternatives considered:** keeping the click-to-compact; keeping the spark logo.
**Why:** a click that silently compacts the conversation "makes no sense" (user, test 13.2); the mascot is what the official extension shows. Open: screenshots of the official extension during a conversation (messages, tool rows, permission prompt) would finish the matching.


## [2026-11-05] Shortcuts: Ctrl+Alt+E replaces Ctrl+Esc, Ctrl+Shift+Esc removed
**Decision:** `claude-local.focusToggle` is Ctrl+Alt+E; Ctrl+Shift+Esc no longer opens the chat (Ctrl+Alt+C does).
**Alternatives considered:** keeping Ctrl+Esc / Ctrl+Shift+Esc and telling the user to rebind; another key for the toggle.
**Why:** Windows takes both old keys (Start menu, Task Manager) and the first test run confirmed neither works. The user chose both changes on 2026-11-05; this reverses the earlier decision that Ctrl+Shift+Esc stays.

## [2026-11-05] @ mentions send absolute paths
**Decision:** the extension inserts the absolute path of a picked file or folder (`@C:/dir/file.js`), also for Alt+K and drag; file content is not inlined.
**Alternatives considered:** reading the file and attaching its content (costs context of the 64,000 window).
**Why:** the CLI does not expand `@relative` in stream-json mode (test 7.1); Claude can read an absolute path itself. Confirm on the real CLI.

## [2026-11-05] F-8/F-9: model aliases and the window through `--settings`, 1M turned off (builder decision)
**Decision:** The CLI is started with `--settings '{"env":{...}}'` carrying every model alias (`ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`) set to the picked model, and, when `environmentVariables` holds a window, `CLAUDE_CODE_MAX_CONTEXT_TOKENS` plus `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`. The context meter also caps the CLI's `maxTokens` at the configured window. Decision 4 of 2026-11-01 (restart, aliases on the picked model) stands; only the delivery changed.
**Alternatives considered:** for F-8, keeping process variables (they lose against `~/.claude/settings.json` `env`, `DEPENDENCIES.md` #39) or editing the user's settings.json (the extension writes no files). For F-9, launching the default with an explicit `--model` (its id is known only after the CLI starts; a restart after `initialize` would cost a process start and touch the start-up protocol), or only capping the meter (the CLI's auto-compact would still plan for 1,000,000 against a 64,000 server window).
**Why:** both fixes were reproduced and confirmed on the real CLI 2.1.317 with the user's settings shape; `--settings` is the one source the CLI ranks above user settings, and turning 1M off removes the `[1m]` suffix at its origin. Risk: not checked on 2.1.246 (`dev/check-model-switch.txt`).


## [2026-11-05] Working-file button: the file is handed to the model once per change (builder decision)
**Decision:** The button in the composer footer shows the working file, by default none. The user picks one in a QuickPick. The file reaches the model as the instruction "התחל את העבודה מהקובץ @path." in front of the next message, and again only when the file changes, not on every message.
**Alternatives considered:** (1) display only, nothing sent (the plan's first proposal); the user rejected it on 2026-11-05 because the button should point the model at the file. (2) A mention on every message (like an always-on "current file" context); it costs tokens on every message, which the user has been cutting. (3) Following VS Code Copilot's exact behaviour: from memory it keeps the open file as implicit context of each request with an on/off toggle; not checked against its current build.
**Why:** (3) is the closest to what the user saw, but the CLI has no implicit-context channel without the IDE server (package F). Once per change gives the model the file at the moment it matters and keeps the cost low. When package F exists, the button can switch to the IDE context.

## [2026-11-05] Source button: file or folder from the explorer (supersedes "Working-file button" above; itself SUPERSEDED 2026-11-08, built 2026-11-09, by "File tagging" below: the file chip is that button)
**Decision:** The button is "מקור השיחה", default none; a click opens the system file explorer in the project folder and takes one file or one folder; the next message carries the agreed instruction once (again only when the choice changes). In memory only. Decided by the user with the discussion session; see the "Attaching files" row in `PLAN.md`.
**Alternatives considered:** keeping the QuickPick of project files (rejected by the user: they want the explorer and folders), several sources at once, persistence (both rejected in the discussion).
**Why:** it matches how the CLI treats `@` (a one-time tag kept in history) and keeps token cost low. The explorer dialog is the system one, not VS Code's own tree.

## [2026-11-06] Navigation tools: VS Code answers, our layer adds position, loading and verification (builder decision, after the user's request for proven reliability)
**Decision:** `findImporters` no longer asks the reference provider about one export; it text-searches `from`/`import`/`import()`/`require` lines and keeps only those whose specifier resolves to the file (Node rules for relative paths; `executeDefinitionProvider` on the module string for bare or aliased ones, `[unverified]` without it). `findReferences` and incoming `callHierarchy` open (in memory) the files that mention the name before asking, and add a text occurrence the provider missed only when the definition provider resolves it to the same declaration. Symbol tools find the position from a declared symbol or an occurrence in code, so imported and used-only names work. The first JS/TS call waits up to 20 s for the language server.
**Alternatives considered:** require a `jsconfig.json` in every project (not under our control, and the user's projects may lack one); reference-provider-only importers (found 1 of 8 in the check); opening every workspace file at start (slow, loads memory for nothing).
**Why:** running the tools in real VS Code showed wrong answers from the first design. Every answer still comes from VS Code's providers; text matches are never reported unless a provider confirms them (except plain `import` text hits whose path resolves to the file). Cost: an extra definition call per unmatched occurrence (bounded to 100), and tens of files opened in memory on a cross-file search (bounded to 200).

## [2026-11-08] Package F: chips fallback, block review as a card option, autosave before tools (builder decisions)
**Decision:** (1) The editor context is sent as a Hebrew `[הקשר מהעורך]` line in front of the next message: the open file's path once per change, the selected lines with their text (capped at 8,000 chars) once per selection; chips are removable until the file or selection changes. (2) Per-block review is an extra option on the Edit/Write card ("סקירה לפי בלוקים…"), not automatic; the card's yes/no stay. (3) When `diffEditor.codeLens` is off (VS Code's default) the blocks are picked in a multi-select QuickPick; the user's settings are never changed. (4) `autosave` saves before Claude reads or edits (on send and when a file tool or permission request names the file), not after the edit.
**Alternatives considered:** the IDE server (waits for the lock-file decision, `PLAN.md` section 6 item 9); opening the review automatically for every edit (an extra editor tab on each edit); turning `diffEditor.codeLens` on for the user (changes their configuration).
**Why:** the CLI does not expand `@path` in stream-json, so the selected text must travel itself; repeats cost tokens in a 64,000 window. Saving before the tool is what lets Claude "see the current file on disk" (the reason given in `PLAN.md`); after the edit VS Code reloads an unmodified file by itself.

## [2026-11-08] IDE server with a temporary lock file: an explicit exception to "the extension writes no files" (user decision)
**Decision:** The extension writes `<CLAUDE_CONFIG_DIR or ~/.claude>/ide/<port>.lock` while its IDE server runs (`src/ide/`), and only that file. It is deleted on dispose, when `claudeLocal.ideServer` is turned off, and on process exit (only while it still names our pid). On start it deletes other locks only when their pid is dead AND their port refuses a connection; live IDEs' locks and unreadable files are never touched. The CLI is pointed at it with `CLAUDE_CODE_SSE_PORT` in the child env. The chips fallback stays on.
**Alternatives considered:** (1) no lock file, only an environment variable or `--ide`: impossible, verified by reading the CLI 2.1.246 binary (`dev/check-ide.ps1`): the CLI finds IDEs only by reading `*.lock` in `<config dir>/ide`, takes the port from the file name and the token from the file; the variable only makes it auto-connect. (2) No IDE server at all, chips only (what package F shipped first): no diagnostics, open editors or `openFile` for Claude. (3) Turning the chips off while the CLI is connected: deferred until a real run shows the CLI uses `selection_changed` in stream-json mode.
**Update 2026-11-09 (package K):** `claudeLocal.ideServer` now defaults to false, so the lock file is not written unless the user turns the server on. The "chips fallback stays on" line is now "chips are the only route by default" (see the File tagging entry).
**Why:** the user decided on 2026-11-08 to build the server with the lock file. The file is per-process, holds no user data beyond the workspace paths and a random token, and is cleaned up; the "front, not a store" principle is otherwise unchanged. Unverified: the token header and the method names (logged in verbose mode to settle them).

## [2026-11-08] Open-items review: dropped features, package J, editor follow (user decisions)
**Decision:** (1) The "move to background" button, conversation-only rewind and "both" are dropped. (2) The navigation package is renamed J (H stays retry / working-file / collapse, which the CHANGELOG records as built). (3) Navigation chat cards are approved. (4) Opening in the editor what Claude reads is done by the extension watching existing tool calls, as a setting off by default, not as a model tool. (5) The repository map waits for a stronger model with the servers installed. (6) Plan-approval buttons: check the CLI first.
**Alternatives considered:** keeping the dropped items as future features (the user chose to drop them); an `openFile` tool for the model (rejected: every tool definition is sent with every request, which costs context in a 64,000 window).
**Why:** the CLI has no support for the dropped items; the extension already sees every tool call, so following it needs no context.

## [2026-11-08] Usage gauge: the real window from Ollama `/api/ps` (approved by the user 2026-11-08)
**Decision:** The usage gauge reads the window from Ollama's `GET <ollama>/api/ps` (`models[].context_length` of the entry whose name matches the CLI's model) after every turn and after each process start. This is a **second exception** to "no network from the extension", next to the gateway's `GET /v1/models` (decision 1 of 2026-11-01), and the user **approved it on 2026-11-08**. Limits: GET only, read-only, nothing written to disk (the last value per model is kept in memory while Ollama has the model unloaded), 2 s timeout, no credentials sent. Address: the setting `claudeLocal.ollamaUrl`, whose default is the current environment's address `http://172.27.5.5:11435` (the user chose to keep the address in the extension's settings so it can be changed later); it is never derived from the gateway; empty or `off` = no read. Fallback when it is off, unreachable, slow or the model is not loaded: `CLAUDE_CODE_MAX_CONTEXT_TOKENS` from `environmentVariables`, then the CLI's `maxTokens`; the chosen window is always a ceiling on the CLI's value.
**Confirmed by the user (2026-11-08):** the extension may read Ollama `/api/ps`; the address is set explicitly in the setting, not derived.
**Alternatives considered:** only the configured window (a guess that can differ from the server's real window, which is what the user asked to avoid); `POST /api/show` (gives the model's trained maximum, not the loaded `num_ctx`); reading through the gateway (LiteLLM has no endpoint for the loaded window).
**Why:** the user asked for the real window Ollama runs with, not a guess; `/api/ps` is the only place that reports it (measured 64,000 for `qwen3.8:27b`).

## [2026-11-08] File tagging: one channel, a file chip and a lines chip; IDE server disabled (user decision, package K)
**Decision:** The file reaches the CLI only as text in the message (`@/abs/path`, `@/abs/path#5-10`), built by one function. Two chips above the box: the file chip (automatic, or a manual choice through an explorer from the project root, with recents; returns to automatic after a send, marked in a colour) and the lines chip (automatic, only when the selection is in the chip's file). `@` and Alt+K insert text in the box, separate from the chips, share the recent list and are deduplicated against the chip. Lines are sent once per change; an unsaved file is saved before sending. X on the chips and the `attachOpenFile` / `attachSelection` switches stay. The IDE server is disabled (`ideServer` default false, marked "currently not working"); `src/ide/` stays in the repo. The file chip replaces the working-file / "מקור השיחה" button. **Opus 5.5 builds it after a one-by-one clarification round with the user** (`PLAN.md` section 10).
**Alternatives considered:** (1) the CLI's native `@` expansion: not available in stream-json mode (`DECISIONS.md` 2026-11-05). (2) The IDE protocol (`selection_changed`, `at_mentioned`) as the main route: depends on the CLI connecting (a 30 s timeout notice already exists) and has no way to send the selected text if the channel drops. (3) Both routes at once (what the code does today for the selection): the user rejected parallel routes that can contradict each other. (4) `@` replacing the file chip: rejected, because `@` is part of the sentence (several files, a position in the text) and would change the chip as a hidden side effect.
**Why:** sending ready text saves the model a step (the user's preference) and keeps one source of truth for what the model was told. Built 2026-11-09 (package K); unit tests and browser preview only, nothing verified in real VS Code.
**Clarification answers, 2026-11-09 (user, one by one; full table `PLAN.md` section 10):** VS Code's own `showOpenDialog` at the project root; one uniform line `[הקשר מהעורך] הקובץ/התיקייה: @path` replaces the old "מקור השיחה" sentences; a folder is sent as the path only; the "back to automatic" mark uses `editorInfo.foreground`; recents = 5, shared, memory only; empty chips show grey hints; a manual path outside the workspace is allowed ("מחוץ לפרויקט"); `ideServer` default false with the 30 s notice kept; tests as in `PLAN.md`. Builder deviations: inline SVG icons (no icon font bundled), folders picked while drilling through the `@` menu are not added to the recents.
