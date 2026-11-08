# Project map

One line per file. (No `graphify-out/graph.json` here, so this map is hand-maintained; update it when files are added, removed or renamed.)

## Root
- `extension.js` — entry: builds logger, settings, registry; sets the secondary-sidebar context key; calls `panels.register`.
- `package.json` — manifest: 10 commands (`claude-local.open` is the single entry point), keybindings (Ctrl+Alt+C = open, Ctrl+Alt+E = focus toggle, Alt+K, Ctrl+Shift+T, opt-in Ctrl+N), editor/title button, 2 view containers (secondary sidebar + activity-bar fallback) + 2 views, settings (`preferredLocation` default `sidebar`).
- `.vscodeignore` — keeps dev/, test/, .claude/ out of the package.
- `AGENT_CONTEXT.md` — entry point for an agent: what to read, current state, working agreements, git rules.
- `spec.md` — what the extension does today (as built) and its verification status.
- `DECISIONS.md` — architecture-level decisions with alternatives and reasons.
- `ARCHITECTURE.md` — structure and boundaries.
- `DEPENDENCIES.md` — vendored libraries and the measured findings about the CLI, the gateway/Ollama and VS Code (with evidence and what is unknown).
- `PLAN.md` — the roadmap: every feature decision with its reason, the settings table, build order (packages A-H), open points, IDE-server design notes, code-navigation MCP server design.
- `FUTURE_FEATURES.md` — ideas not yet decided; each is reviewed with the user and, once approved, moves into `PLAN.md`.
- `FIXES.md` — the open items of the user-reported fix list (Fix 1 is done and moved to `CHANGELOG.md`).
- `git-instructions.md` — the git workflow.
- `CHANGELOG.md` — what changed and why, newest first.
- `SETUP.md` — install and settings for the user's machine (Hebrew).

## src/cli/ — the CLI process
- `args.js` — builds the stream-json argument list (`--resume`, `--model`, bypass flag).
- `spawn.js` — resolves the executable on PATH x PATHEXT; `.cmd`/`.bat` via `cmd.exe /d /s /c`.
- `env.js` — merges `process.env`, `claudeLocal.environmentVariables` and the entrypoint variable (shared by chat and terminal).
- `terminal.js` — Open in Terminal: runs the CLI interactively in a VS Code terminal.
- `process.js` — `CliProcess`: NDJSON over stdio, control protocol, interrupt, kill fallback.
- `content.js` — helpers for message content blocks (shared by live stream and transcripts).

## src/panels/ — host side of the chat
- `places.js` — THE placement rule: `places.main()` reveals/focuses the `preferredLocation` place (sidebar view by default, or ONE editor tab; never duplicated).
- `conversation-host.js` — `ConversationHost`: hosts several conversations in one place, one attached to the webview; routes the drawer messages (ready, newConversation, switch/close/renameConversation, openSession, listConversations, viewFocus); sends a hidden conversation's queue; `[session]` logs.
- `replay-log.js` — pure: records what a hidden conversation would show (deltas folded per block, snapshots, agent cards) and builds the `restore` message.
- `conversation.js` — one CLI process: permissions, mode/model, stop; `attach`/`detach`/`restoreMessage`; records into the replay log and paints only while attached; unread when a turn ends unseen.
- `message-router.js` — webview message `type` to `Conversation` method.
- `mentions.js` — file/folder listing (`git ls-files` or walk) and ranking for `@` completion (pure apart from `git`).
- `work-file.js` — the working-file button: tracks the open file (or the user's pick), a QuickPick to choose another, and `withWorkFile` which puts `@path` in front of the next message when the file changed (package H).
- `plan-doc.js` — read-only virtual Markdown document for the plan (`claude-local-plan:` scheme).
- `event-translator.js` — CLI stream lines to UI events (pure).
- `webview-html.js` — builds the webview HTML with CSP, nonce and resource URIs.
- `panel-registry.js` — in-memory closed list (max 10) for any place, open states, change listener.
- `session-model.js` — pure: `conversationStatus`, `conversationRow`, `hiddenAttention`, `decorateTitle`, `pushClosed`.
- `chat-panel.js` — the editor-tab host (`claudeLocalPanel`); tab title marker for hidden conversations.
- `sidebar-view.js` — the sidebar/activity-bar host; the `ConversationHost` outlives the `WebviewView`; `view.badge` = hidden waiting + unread, description = title.
- `commands.js` — `claude-local.*` commands (`open` follows `preferredLocation` / `useTerminal`; `newConversation`, `terminal.open`, `focusToggle` via `viewFocus`, `keyboardShortcuts`, `reopenClosed`, `continueLast`, logs); sets the `claude-local:hasClosed` context key.
- `model-switch.js` — `ModelSwitcher`: model list post, `switchTo` (kill + restart with `--model` + `--resume`), `stopAndSwitch` (modal Hebrew warning), "does not support tools" revert.
- `context-meter.js` — `get_context_usage` after initialize and each result, capped at the configured window, posts `context` to the webview.
- `error-card.js` — builds the Hebrew CLI-failure card (connection checklist, `.cmd`/`.bat` warning).
- `settings-actions.js` — opens `settings.json` or a given setting from the card buttons.
- `display-settings.js` — pure: `readDisplay` / `sanitizeVerbs`, the display and accessibility settings sent to the webview.
- `status-bar.js` — the "✻ Claude" item.
- `index.js` — `register` for the panels feature.

## src/mcp/ — MCP management (host side)
- `mcp-args.js` — builds and validates `claude mcp add/remove` arguments (refuses shell metacharacters).
- `mcp-model.js` — normalizes the `mcp_status` response into a server list (defensive parsing).
- `mcp-cli.js` — runs `claude mcp add/remove` via `runClaude` with the resolved `claudePath` and merged environment.
- `mcp-handler.js` — handles the webview `mcp` message (status, reconnect, toggle, add, remove).
- `nav-server.js` — code-navigation MCP server: HTTP on 127.0.0.1, Bearer token, hand-written JSON-RPC.
- `nav-config.js` — inline `--mcp-config` JSON and allowed-tool name for `claude-local-nav`.
- `nav-tools.js` — the eight navigation tools (`documentSymbols`, `readSymbol`, `findReferences`, `goToDefinition`, `findImporters`, `workspaceSymbols`, `hover`, `callHierarchy`): position finding, language-server wait, file loading, verification of missed uses, caps, workspace path limit; no `vscode` import.
- `nav-vscode.js` — the only file that requires `vscode`; supplies the dependencies to `createNavTools` (providers, bounded workspace text search that marks a cut result).

## src/uri/ — URI handler
- `index.js` — registers the handler for `vscode://local.claude-local/open`: modal confirm, prefill, open through `places.main()`.
- `uri-parse.js` — pure: parses and validates `prompt` (max 8000) and `session`.

## src/models/ — model gateway (package D)
- `gateway.js` — `resolveGatewayUrl`, `fetchModels` (`/v1/models` + `/v1/model/info`, 5 s, in memory).
- `filter.js` (pure) — hides `output_config.format` models and `modelDenylist`; `isNoToolsError`.
- `launch.js` (pure) — `launchSettings`: the `--settings` env (model aliases for a picked model; the window + `CLAUDE_CODE_DISABLE_1M_CONTEXT`); `contextWindow`.
## src/background/ — background task map
- `task-map.js` — pure map from `task_started` / `background_tasks_changed` / `task_updated` / `task_notification`. Test: `test/task-map.test.js`. UI: `webview/chat/tasks-bar.js` (`#bg-tasks` bar with stop).

## src/tasks/ — Claude's task list
- `claude-tasks.js` — pure: `TaskCreate`/`TaskUpdate`/`TaskList` results to a task list. Test: `test/claude-tasks.test.js`. UI: `webview/chat/tasks.js` (collapsible checklist).

## src/agents/ — agent cards
- `agent-map.js` — pure: raw CLI lines (`Agent`/`Task` tool_use and result, inner lines by `parent_tool_use_id`, `task_started`/`task_progress`/`task_updated`/`task_notification`) to cards. Test: `test/agent-map.test.js`.
- `agent-cards.js` — host: feeds lines to the map, posts `agentCards`, `[agents]` logs. UI: `webview/chat/agent-cards.js` + `agent-cards.css`.

## src/loop/ — /loop indicator
- `loop-jobs.js` — pure: `CronCreate`/`CronList`/`CronDelete` to jobs; `stopPrompt`. `self-turn.js` — pure: detects a top-level `message_start`/`assistant` while not busy. `loop-host.js` — `trackLoop`/`resetLoop`/`stopLoop` (ignores late lines 10 s after a forced stop). Test: `test/loop.test.js`. UI: `webview/chat/loop-bar.js` (`#loop-jobs`), `cron-next.js` (pure next-run).

## src/checkpoints/ — rewind code and fork
- `checkpoints.js` — pure: `CHECKPOINT_ENV`, `checkpointArgs({fork})`, `checkpointFrom`/`addCheckpoint` from replayed user lines, `filesChangedCount`. Test: `test/checkpoints.test.js`.
- `rewind-menu.js` — Esc Esc QuickPick of this process's prompts, then rewind code (dry run, confirm, real) or fork.

## src/diff/ — shared diff view and `/diff`
- `edit-log.js` — pure log of final Edit/MultiEdit/Write tool events (`listFiles`, `fileDiff`).
- `diff-view.js` — `createDiffView().show(...)`: read-only virtual documents (`claude-local-diff:`) and `vscode.diff`; reused by package F and `openDiff`.
- `diff-command.js` — `/diff` QuickPick to diff.

## src/history/ — read-only transcripts
- `transcripts.js` — `listSessions`, `readSession`, `sessionTitle` for `~/.claude/projects/...`.
- `transcript-events.js` — transcript entries to the same UI events as live.

## src/util/
- `workspace.js` (`workspaceCwd`: first folder or home), `logger.js` (OutputChannel + ring buffer, tagged API, copy), `log-tags.js` (fixed feature tags), `log-buffer.js` (pure: redact, line format, level filter, ring buffer), `settings.js` (`claudeLocal.*` + change events), `paths.js` (CLI dirs, `encodeCwd`), `nonce.js`, `vscode-version.js` (secondary sidebar >= 1.106).

## webview/chat/ — plain scripts loaded by `index.html`
- `index.html` shell. Styles by topic: `chat.css` (tokens, header, thread), `composer.css`, `drawer.css`, `cards.css`, `mcp.css`, `a11y.css` (focus view, reduced motion, daltonized palette, sr-only), `highlight-theme.css`, `agent-cards.css`.
- Scripts: `util.js`; `markdown.js` (marked wrapper, escapes raw HTML, fills math with KaTeX); `math-logic.js` (pure, UMD, tested: finds `$..# Project map

One line per file. (No `graphify-out/graph.json` here, so this map is hand-maintained; update it when files are added, removed or renamed.)

## Root
- `extension.js` — entry: builds logger, settings, registry; sets the secondary-sidebar context key; calls `panels.register`.
- `package.json` — manifest: 10 commands (`claude-local.open` is the single entry point), keybindings (Ctrl+Alt+C = open, Ctrl+Alt+E = focus toggle, Alt+K, Ctrl+Shift+T, opt-in Ctrl+N), editor/title button, 2 view containers (secondary sidebar + activity-bar fallback) + 2 views, settings (`preferredLocation` default `sidebar`).
- `.vscodeignore` — keeps dev/, test/, .claude/ out of the package.
- `AGENT_CONTEXT.md` — entry point for an agent: what to read, current state, working agreements, git rules.
- `spec.md` — what the extension does today (as built) and its verification status.
- `DECISIONS.md` — architecture-level decisions with alternatives and reasons.
- `ARCHITECTURE.md` — structure and boundaries.
- `DEPENDENCIES.md` — vendored libraries and the measured findings about the CLI, the gateway/Ollama and VS Code (with evidence and what is unknown).
- `PLAN.md` — the roadmap: every feature decision with its reason, the settings table, build order (packages A-G), open points, IDE-server design notes.
- `FIXES.md` — the open items of the user-reported fix list (Fix 1 is done and moved to `CHANGELOG.md`).
- `git-instructions.md` — the git workflow.
- `CHANGELOG.md` — what changed and why, newest first.
- `SETUP.md` — install and settings for the user's machine (Hebrew).

## src/cli/ — the CLI process
- `args.js` — builds the stream-json argument list (`--resume`, `--model`, bypass flag).
- `spawn.js` — resolves the executable on PATH x PATHEXT; `.cmd`/`.bat` via `cmd.exe /d /s /c`.
- `env.js` — merges `process.env`, `claudeLocal.environmentVariables` and the entrypoint variable (shared by chat and terminal).
- `terminal.js` — Open in Terminal: runs the CLI interactively in a VS Code terminal.
- `process.js` — `CliProcess`: NDJSON over stdio, control protocol, interrupt, kill fallback.
- `content.js` — helpers for message content blocks (shared by live stream and transcripts).

## src/panels/ — host side of the chat
- `places.js` — THE placement rule: `places.main()` reveals/focuses the `preferredLocation` place (sidebar view by default, or ONE editor tab; never duplicated).
- `conversation-host.js` — `ConversationHost`: hosts several conversations in one place, one attached to the webview; routes the drawer messages (ready, newConversation, switch/close/renameConversation, openSession, listConversations, viewFocus); sends a hidden conversation's queue; `[session]` logs.
- `replay-log.js` — pure: records what a hidden conversation would show (deltas folded per block, snapshots, agent cards) and builds the `restore` message.
- `conversation.js` — one CLI process: permissions, mode/model, stop; `attach`/`detach`/`restoreMessage`; records into the replay log and paints only while attached; unread when a turn ends unseen.
- `message-router.js` — webview message `type` to `Conversation` method.
- `mentions.js` — file/folder listing (`git ls-files` or walk) and ranking for `@` completion (pure apart from `git`).
- `work-file.js` — the working-file button: tracks the open file (or the user's pick), a QuickPick to choose another, and `withWorkFile` which puts `@path` in front of the next message when the file changed (package H).
- `plan-doc.js` — read-only virtual Markdown document for the plan (`claude-local-plan:` scheme).
- `event-translator.js` — CLI stream lines to UI events (pure).
- `webview-html.js` — builds the webview HTML with CSP, nonce and resource URIs.
- `panel-registry.js` — in-memory closed list (max 10) for any place, open states, change listener.
- `session-model.js` — pure: `conversationStatus`, `conversationRow`, `hiddenAttention`, `decorateTitle`, `pushClosed`.
- `chat-panel.js` — the editor-tab host (`claudeLocalPanel`); tab title marker for hidden conversations.
- `sidebar-view.js` — the sidebar/activity-bar host; the `ConversationHost` outlives the `WebviewView`; `view.badge` = hidden waiting + unread, description = title.
- `commands.js` — `claude-local.*` commands (`open` follows `preferredLocation` / `useTerminal`; `newConversation`, `terminal.open`, `focusToggle` via `viewFocus`, `keyboardShortcuts`, `reopenClosed`, `continueLast`, logs); sets the `claude-local:hasClosed` context key.
- `model-switch.js` — `ModelSwitcher`: model list post, `switchTo` (kill + restart with `--model` + `--resume`), `stopAndSwitch` (modal Hebrew warning), "does not support tools" revert.
- `context-meter.js` — `get_context_usage` after initialize and each result, capped at the configured window, posts `context` to the webview.
- `error-card.js` — builds the Hebrew CLI-failure card (connection checklist, `.cmd`/`.bat` warning).
- `settings-actions.js` — opens `settings.json` or a given setting from the card buttons.
- `display-settings.js` — pure: `readDisplay` / `sanitizeVerbs`, the display and accessibility settings sent to the webview.
- `status-bar.js` — the "✻ Claude" item.
- `index.js` — `register` for the panels feature.

## src/mcp/ — MCP management (host side)
- `mcp-args.js` — builds and validates `claude mcp add/remove` arguments (refuses shell metacharacters).
- `mcp-model.js` — normalizes the `mcp_status` response into a server list (defensive parsing).
- `mcp-cli.js` — runs `claude mcp add/remove` via `runClaude` with the resolved `claudePath` and merged environment.
- `mcp-handler.js` — handles the webview `mcp` message (status, reconnect, toggle, add, remove).

## src/uri/ — URI handler
- `index.js` — registers the handler for `vscode://local.claude-local/open`: modal confirm, prefill, open through `places.main()`.
- `uri-parse.js` — pure: parses and validates `prompt` (max 8000) and `session`.

## src/models/ — model gateway (package D)
- `gateway.js` — `resolveGatewayUrl`, `fetchModels` (`/v1/models` + `/v1/model/info`, 5 s, in memory).
- `filter.js` (pure) — hides `output_config.format` models and `modelDenylist`; `isNoToolsError`.
- `launch.js` (pure) — `launchSettings`: the `--settings` env (model aliases for a picked model; the window + `CLAUDE_CODE_DISABLE_1M_CONTEXT`); `contextWindow`.
## src/background/ — background task map
- `task-map.js` — pure map from `task_started` / `background_tasks_changed` / `task_updated` / `task_notification`. Test: `test/task-map.test.js`. UI: `webview/chat/tasks-bar.js` (`#bg-tasks` bar with stop).

## src/tasks/ — Claude's task list
- `claude-tasks.js` — pure: `TaskCreate`/`TaskUpdate`/`TaskList` results to a task list. Test: `test/claude-tasks.test.js`. UI: `webview/chat/tasks.js` (collapsible checklist).

## src/agents/ — agent cards
- `agent-map.js` — pure: raw CLI lines (`Agent`/`Task` tool_use and result, inner lines by `parent_tool_use_id`, `task_started`/`task_progress`/`task_updated`/`task_notification`) to cards. Test: `test/agent-map.test.js`.
- `agent-cards.js` — host: feeds lines to the map, posts `agentCards`, `[agents]` logs. UI: `webview/chat/agent-cards.js` + `agent-cards.css`.

## src/loop/ — /loop indicator
- `loop-jobs.js` — pure: `CronCreate`/`CronList`/`CronDelete` to jobs; `stopPrompt`. `self-turn.js` — pure: detects a top-level `message_start`/`assistant` while not busy. `loop-host.js` — `trackLoop`/`resetLoop`/`stopLoop` (ignores late lines 10 s after a forced stop). Test: `test/loop.test.js`. UI: `webview/chat/loop-bar.js` (`#loop-jobs`), `cron-next.js` (pure next-run).

## src/checkpoints/ — rewind code and fork
- `checkpoints.js` — pure: `CHECKPOINT_ENV`, `checkpointArgs({fork})`, `checkpointFrom`/`addCheckpoint` from replayed user lines, `filesChangedCount`. Test: `test/checkpoints.test.js`.
- `rewind-menu.js` — Esc Esc QuickPick of this process's prompts, then rewind code (dry run, confirm, real) or fork.

## src/diff/ — shared diff view and `/diff`
- `edit-log.js` — pure log of final Edit/MultiEdit/Write tool events (`listFiles`, `fileDiff`).
- `diff-view.js` — `createDiffView().show(...)`: read-only virtual documents (`claude-local-diff:`) and `vscode.diff`; reused by package F and `openDiff`.
- `diff-command.js` — `/diff` QuickPick to diff.

## src/history/ — read-only transcripts
- `transcripts.js` — `listSessions`, `readSession`, `sessionTitle` for `~/.claude/projects/...`.
- `transcript-events.js` — transcript entries to the same UI events as live.

## src/util/
- `workspace.js` (`workspaceCwd`: first folder or home), `logger.js` (OutputChannel + ring buffer, tagged API, copy), `log-tags.js` (fixed feature tags), `log-buffer.js` (pure: redact, line format, level filter, ring buffer), `settings.js` (`claudeLocal.*` + change events), `paths.js` (CLI dirs, `encodeCwd`), `nonce.js`, `vscode-version.js` (secondary sidebar >= 1.106).

## webview/chat/ — plain scripts loaded by `index.html`
- `index.html` shell. Styles by topic: `chat.css` (tokens, header, thread), `composer.css`, `drawer.css`, `cards.css`, `mcp.css`, `a11y.css` (focus view, reduced motion, daltonized palette, sr-only), `highlight-theme.css`, `agent-cards.css`.
- Scripts: `util.js`; /`$..$`/`(..)`/`[..]` outside code); `tools.js` (tool rows); `thread.js` (messages, streaming); `cards.js` (permission/plan/question cards; permission = numbered options); `menu.js` (shared list menu); `slash-menu.js` (grouped `/` commands); `prompt-logic.js` (pure: command grouping, queue, history, image check); `mention-menu.js` (`@` files/folders); `keys.js` (parses and matches the `keybindings.*` specs); `composer.js` ("+" menu, "/" button, model pill incl. "stop and switch", mode, `uiState`/`restore`); `context-meter.js` (display only); `drawer.js` + `drawer-logic.js` (pure, UMD, tested: the conversation drawer); `restore.js` (redraw after a switch in one pass); `mcp-dialog.js`; `error-card.js` (CLI-failure card); `display-logic.js` (pure: spinner verb, time format, speaker label, heading text); `display.js` (display settings as body attributes, speaker headings); `a11y.js` (screen-reader announcer); `app.js` (wiring, messages from host: `restore`, `conversations`, `conversationStates`, `title`, ...).
- Added by B2: `agent-cards.js` + `agent-cards.css` (agent cards after the tool row; `thread.js` has `CL.thread.toolNode(id)`), `loop-bar.js` (`/loop` bar), `cron-next.js` (pure, UMD), `tasks-bar.js`, `tasks.js`; `app.js` also handles `agentCards`, `loopJobs`, `selfTurn`.

## webview/vendor/
- `marked.umd.js`, `marked.LICENSE.md`, `highlight.min.js`, `powershell.min.js`, `highlight.LICENSE`, `katex/` (`katex.min.js`, `katex.min.css`, `fonts/*.woff2`, `LICENSE`) — see DEPENDENCIES.md. Test: `test/math-logic.test.js`.

## resources/
- `claude-mascot.svg` — the Claude Code mascot, full colour (editor-title button, tab icon).
- `claude-mascot-mono.svg` — the mascot in `currentColor` (view containers).

## dev/ — development only (not packaged)
- `README.md` — how to run the probes, the gateway probe, the fake CLI and the browser preview.
- `claude-code-vscode-guide-he.html` — Hebrew guide to the official extension's features (reference for `PLAN.md`).
- `check-context-window.txt` — Hebrew `/api/ps` check of the 64,000 window, for the user.
- `check-model-switch.txt` — Hebrew check of F-8/F-9 on the user's CLI (log lines, `/api/ps`).
- `check-at-mention.txt` — Hebrew check, run by the user: does the real CLI expand `@path` in stream-json (tools blocked, a secret word in a temp file).
- `check-btw-and-files.txt` — Hebrew checks run by the user: `/btw` against the real CLI (script, then interactive), the `@` pointer, and the file-attachment flows in VS Code (`@` list, Alt+K, drag, working-file button, no persistence).
- `check-all.txt` — the single full Hebrew check pack for the user (setup, unit tests, `@`, `/btw`, file attachment, model switch, context window, everything built on 2026-11-05) with step-by-step instructions; built from the other check files.
- `fake-claude.js` / `.cmd` — fake stream-json CLI (scenarios `tool`, `שאלה`, `slow`, `edit`, `background`, `tasks`, `agent`, `loop` with `FAKE_CLAUDE_LOOP_MS`; `FAKE_CLAUDE_NO_TOOLS_MODEL`; `--settings` env over `FAKE_CLAUDE_USER_SETTINGS_ENV`; default model `fake-model[1m]` unless 1M is off; answers `get_context_usage`).
- `manual-tests.html` — Hebrew manual test checklist.
- `preview-server.js`, `preview-host.js`, `preview-theme.css` — browser preview with a simulated host (several conversations, drawer, restore, MCP, bars; URL params `?conv=c2`, `?open=drawer|mcp|slash|attach|mode`, `?theme=light`).
- `probe-cli.js` — first CLI feasibility probe (needs the repo); `probe-standalone.js`, `probe2-standalone.js`, `probe3-standalone.js` — self-contained probes against the real CLI (checks `p1`-`p8`, `q1`-`q10`, `s1`-`s5`).
- `probe4-standalone.js` — self-contained probe: background tasks, Task tools, sub-agents, cron tools.
- `gateway-probe/` — dev-only VS Code extension (`package.json`, `extension.js`, `probe.js`) that checks the extension host can reach the model gateway.
- `nav-check/` — dev-only check of the eight navigation tools in real VS Code through the real nav server over HTTP: `runner.js` (37 checks with hand-written expected answers), `package.json` + `ext.js` (empty extension that loads it), `fixture/` (JS/React project with a same-named decoy module, multi-line, CommonJS, `import()`, side-effect and re-export imports, a commented import, a C# file), `outside.js` (path-limit check). Writes `nav-check-report.txt` (not committed).

## test/
- `work-file.test.js` — withWorkFile (once per change) and current.
- `args.test.js`, `process.test.js`, `env.test.js`, `keys.test.js`, `event-translator.test.js`, `transcripts.test.js`, `conversation.test.js` (stub `vscode`), `conversation-host.test.js` (F-2 with the fake CLI, hidden permission, close, open session, stale queue), `replay-log.test.js`, `drawer-logic.test.js`, `prompt-logic.test.js`, `mentions.test.js`, `session-model.test.js`, `panel-registry.test.js`, `mcp.test.js`, `error-card-uri.test.js`, `display.test.js`, `models.test.js`, `edit-log.test.js` (incl. the fake CLI "edit" scenario), `checkpoints.test.js`, `task-map.test.js`, `claude-tasks.test.js`, `agent-map.test.js`, `loop.test.js` (`loop-jobs`, `cron-next`, `self-turn`), `log-buffer.test.js`, `nav-server.test.js`, `nav-tools.test.js` (fake provider results for all eight tools, incl. the 2026-11-06 reliability fixes), `nav-vscode.test.js`. 217 tests in all (all pass on Windows, run after the 2026-11-08 merge; on Linux `chmod +x dev/fake-claude.js` first).

## .claude/
- `launch.json` — "chat-preview" server config.
