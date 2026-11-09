# Project map

One line per file; hand-maintained (no `graphify-out/graph.json`): update when files are added, removed or renamed.

## Root
- `extension.js` — entry: builds logger, settings, registry; sets the secondary-sidebar context key; calls `panels.register`.
- `package.json` — manifest: 10 commands (`claude-local.open` = the single entry point), keybindings (Ctrl+Alt+C open, Ctrl+Alt+E focus toggle, Alt+K, Ctrl+Shift+T, opt-in Ctrl+N), editor/title button, 2 view containers (secondary sidebar + activity-bar fallback) + 2 views, settings.
- `.vscodeignore` — keeps dev/, test/, .claude/ out of the package.
- `AGENT_CONTEXT.md` — session brief: what to read, models, limits, constraints, current state, working agreements.
- `spec.md` — what the extension does today (as built) + verification status.
- `DECISIONS.md` — decisions with alternatives and reasons.
- `ARCHITECTURE.md` — structure and boundaries.
- `DEPENDENCIES.md` — vendored libraries and measured findings about the CLI, gateway/Ollama, VS Code.
- `PLAN.md` — the roadmap: feature decisions with reasons, settings provenance, build order (packages A-K), open points, IDE-server and code-navigation designs.
- `FUTURE_FEATURES.md` — undecided ideas; once approved they move into `PLAN.md`.
- `FIXES.md` — open items of the user-reported fix list.
- `git-instructions.md` — git workflow. `CHANGELOG.md` — what changed and why, newest first. `SETUP.md` — install and settings for the user's machine (Hebrew).

## src/cli/ — the CLI process
- `args.js` — builds the stream-json argument list (`--resume`, `--model`, bypass flag).
- `spawn.js` — resolves the executable on PATH x PATHEXT; `.cmd`/`.bat` via `cmd.exe /d /s /c`.
- `env.js` — merges `process.env`, `claudeLocal.environmentVariables` and the entrypoint variable (shared by chat and terminal).
- `terminal.js` — Open in Terminal: runs the CLI interactively in a VS Code terminal.
- `process.js` — `CliProcess`: NDJSON over stdio, control protocol (`send`/`request`/`respond`/`respondError`/`interrupt`/`kill`), kill fallback.
- `content.js` — helpers for message content blocks (shared by live stream and transcripts).
- `btw.js` — the one-shot `/btw` process: `runBtw` (`claude -p --output-format json --tools "" --no-session-persistence`, question on stdin, 20 min timeout), `buildBtwPrompt` (earlier side turns in the stdin text, 24,000 chars), `btwCwd` (neutral temp folder `claude-local-btw`). Test: `test/btw.test.js`.

## src/panels/ — host side of the chat
- `places.js` — THE placement rule: `places.main()` reveals/focuses the `preferredLocation` place (sidebar view by default, or ONE editor tab; never duplicated).
- `conversation-host.js` — `ConversationHost`: hosts several conversations in one place, one attached to the webview; routes the drawer messages (ready, newConversation, switch/close/renameConversation, openSession, listConversations, viewFocus); sends a hidden conversation's queue; `[session]` logs.
- `replay-log.js` — pure: records what a hidden conversation would show (deltas folded per block, snapshots, agent cards) and builds the `restore` message.
- `conversation.js` — one CLI process: permissions, mode/model, stop; `attach`/`detach`/`restoreMessage`; records into the replay log and paints only while attached; unread when a turn ends unseen.
- `message-router.js` — webview message `type` to `Conversation` method; logs throwing or rejecting handlers. Test: `test/message-router.test.js`.
- `resolve-path.js` — resolves a relative navigation/tool path against the workspace folders, then the cwd (for the open button and nav card rows).
- `mentions.js` — file/folder listing (`git ls-files` or walk) and ranking for `@` completion (pure apart from `git`).
- `editor-context.js` — the editor tracker and autosave helpers (package F); the chips and `withContext` moved to `src/tagging/` (package K); re-exports `linesMention` for Alt+K. (`work-file.js`, the source button, was deleted by package K.)
- `plan-doc.js` — read-only virtual Markdown document for the plan (`claude-local-plan:` scheme).
- `event-translator.js` — CLI stream lines to UI events (pure).
- `webview-html.js` — builds the webview HTML with CSP, nonce and resource URIs.
- `panel-registry.js` — in-memory closed list (max 10) for any place, open states, change listener.
- `session-model.js` — pure: `conversationStatus`, `conversationRow`, `hiddenAttention`, `decorateTitle`, `pushClosed`.
- `chat-panel.js` — the editor-tab host (`claudeLocalPanel`); tab title marker for hidden conversations.
- `btw-panel.js` — the `/btw` side panel (`claudeLocalBtw`, singleton, `ViewColumn.Beside`, created lazily as `services.btwPanel`); vscode glue only, closing it drops the side history.
- `btw-session.js` — pure: the side conversation (in-memory history, one question in flight, cancel, clear) over `runBtw`/`buildBtwPrompt` from `src/cli/btw.js`. Test: `test/btw-session.test.js`.
- `sidebar-view.js` — the sidebar/activity-bar host; the `ConversationHost` outlives the `WebviewView`; `view.badge` = hidden waiting + unread, description = title.
- `commands.js` — `claude-local.*` commands (`open` follows `preferredLocation` / `useTerminal`; `newConversation`, `terminal.open`, `focusToggle` via `viewFocus`, `keyboardShortcuts`, `reopenClosed`, `continueLast`, logs); sets the `claude-local:hasClosed` context key.
- `model-switch.js` — `ModelSwitcher`: model list post, `switchTo` (kill + restart with `--model` + `--resume`), `stopAndSwitch` (modal Hebrew warning), "does not support tools" revert.
- `context-meter.js` — usage gauge host side: `get_context_usage` after initialize (also after a model switch) and each result; window = Ollama `/api/ps` for the loaded model (`src/models/ollama.js`), else `CLAUDE_CODE_MAX_CONTEXT_TOKENS`, else the CLI value, as a ceiling on the CLI's `maxTokens`; posts `context` with `source`, `categories`, `memoryFiles`, `mcpServers`.
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
- `ollama.js` — `resolveOllamaUrl` (`claudeLocal.ollamaUrl`; empty or `off` = no read), `windowFromPs`, `fetchOllamaWindow` (`GET /api/ps`, 2 s, in memory; approved by the user, `DECISIONS.md` 2026-11-08).
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
- `diff-view.js` — `createDiffView().show(...)`: read-only virtual documents (`claude-local-diff:`) and `vscode.diff`; returns both URIs; reused by package F and `openDiff`.
- `blocks.js` — pure line diff for per-block approval: `diffBlocks`, `applyBlocks`, `reviewTexts` (Edit/Write), `decision` (allow / partial `updatedInput` / deny) (package F).
- `block-review.js` — `createBlockReview(diffView).review(...)`: CodeLens toggles on the diff view, or a multi-select QuickPick when `diffEditor.codeLens` is off; `cancel(requestId)` (package F).
- `diff-command.js` — `/diff` QuickPick to diff; exports the shared `showFileDiff` (also used by the changes card).
- `change-stats.js` — pure: added/removed line counts per file from the edit log (LCS line diff per fragment, prefix/suffix trim, fallback above 2000x2000 cells; `Write` vs the last known content, else all added).
- `changes-card.js` — pure: builds `{type:'changesCard', files:[{path, rel, added, removed}]}` from the edit log.

## src/ide/ — IDE server for the CLI (package F, PLAN.md section 7)
- `ws-frames.js` — pure RFC 6455 codec: `acceptKey`, `encodeFrame`, `createDecoder` (masking, 7/16/64-bit lengths, fragmentation, control frames, `WsError` close codes).
- `ws-server.js` — `startWsServer`: 127.0.0.1, random port, token check (`TOKEN_HEADERS`), local-Origin check, subprotocol `mcp` echo, handshake logging with the token masked.
- `ide-rpc.js` — pure MCP JSON-RPC: `TOOLS` (`getDiagnostics`, `getOpenEditors`, `openFile`), `createIdeRpc({deps})`, `selectionChanged`.
- `ide-lock.js` — the lock file `<config dir>/ide/<port>.lock`: `lockDir`, `lockContent`, `writeLock`, `removeLock`, `cleanStaleLocks` (pid dead AND port refusing).
- `ide-service.js` — `createIdeService`: server + RPC + lock, `envFor(cwd)` (`CLAUDE_CODE_SSE_PORT`), `watchConnection`, `notifySelection`, verbose message log (no vscode).
- `ide-vscode.js` — the vscode side: tool functions, `editorSelection`, `workspaceFolderPaths`.
- `index.js` — `register`: follows `claudeLocal.ideServer`, feeds the editor tracker into `selection_changed`, sets `services.ide`.

## src/tagging/ — file tagging: file chip and lines chip (package K)
- `chips.js` — pure: `view()`, `withContext()` (the single function that produces the CLI text `[הקשר מהעורך] הקובץ/התיקייה: @path` plus the lines block), `linesMention`, `mentionedKeys`, `pathKey`.
- `recent-files.js` — pure: the shared 5-item in-memory recent list and the `@`-menu recent rows.
- `file-chip.js` — vscode glue: per-conversation chip state, actions (auto, pick, recent, remove, removeLines, ack), `applyToSend`, `autosaveFilter`, `isOutside`.

## src/history/ — read-only transcripts
- `transcripts.js` — `listSessions`, `readSession`, `sessionTitle` for `~/.claude/projects/...`.
- `transcript-events.js` — transcript entries to the same UI events as live.

## src/util/
- `workspace.js` (`workspaceCwd`: first folder or home), `logger.js` (OutputChannel + ring buffer, tagged API, copy), `log-tags.js` (fixed feature tags), `log-buffer.js` (pure: redact, line format, level filter, ring buffer), `settings.js` (`claudeLocal.*` + change events), `paths.js` (CLI dirs, `encodeCwd`), `nonce.js`, `vscode-version.js` (secondary sidebar >= 1.106).

## webview/chat/ — plain scripts loaded by `index.html`
- `index.html` shell. Styles by topic: `chat.css` (tokens, header, thread), `composer.css`, `drawer.css`, `cards.css`, `mcp.css`, `a11y.css` (focus view, reduced motion, daltonized palette, sr-only), `highlight-theme.css`, `agent-cards.css`.
- Scripts: `util.js`; `math-logic.js` (pure, UMD: `$..$` / `\(..\)` / `$$..$$` / `\[..\]` outside code, placeholders; test `test/math-logic.test.js`); `markdown.js` (marked + highlight.js + KaTeX); `tools.js` (tool rows); `thread.js` (messages, streaming); `cards.js` (permission/plan/question cards; permission = numbered options); `menu.js` (shared list menu, `place()` clamps inside the composer); `slash-menu.js` (grouped `/` commands); `prompt-logic.js` (pure: command grouping, queue, history, image check); `mention-menu.js` (`@` files/folders); `keys.js` (parses and matches the `keybindings.*` specs); `composer.js` ("+" menu, "/" button, model pill incl. "stop and switch", mode, `uiState`/`restore`); `usage-gauge.js` + `usage-gauge-logic.js` (pure, UMD, tested: ring gauge and its context-breakdown card; display only); `drawer.js` + `drawer-logic.js` (pure, UMD, tested: the conversation drawer); `restore.js` (redraw after a switch in one pass); `mcp-dialog.js`; `error-card.js` (CLI-failure card); `display-logic.js` (pure: spinner verb, time format, speaker label, heading text); `display.js` (display settings as body attributes, speaker headings); `a11y.js` (screen-reader announcer); `app.js` (wiring, host messages: `restore`, `conversations`, `conversationStates`, `title`, ...).
- B2: `agent-cards.js` + `.css` (cards after the tool row; `thread.js` `CL.thread.toolNode(id)`), `loop-bar.js` (`/loop` bar), `cron-next.js` (pure, UMD), `tasks-bar.js`, `tasks.js`; `app.js` also handles `agentCards`, `loopJobs`, `selfTurn`.
- `file-chips.js` — the file chip and lines chip above the box, the click menu (via `CL.menu`), the "הוחזר למצב אוטומטי" mark (Claude orange), the empty-chip hints (package K).
- `nav-results.js` — `CL.navResults` parse/title/render: the Hebrew card per navigation tool result (up to 50 clickable rows, "ועוד N שלא מוצגים"; none for `readSymbol`/`hover`). `tools.js` `navSummary` and `thread.js` (head button + sibling `.tool-open` "פתיחה בעורך" button) feed the open button.
- `trigger-token.js` — pure: `CL.triggerToken.find(text, caret)`, the `/` and `@` token under the caret for mid-sentence menus (used by `composer.js`).
- `changes-card.js` + `changes-card.css` — the collapsible "שינויים בשיחה (N קבצים)" card above the composer; a click sends `openChangeDiff`.
- `webview/btw/` (`index.html`, `btw.css`, `btw.js`) — page of the `/btw` side panel (`btwHtml()` in `src/panels/webview-html.js` fills `{{btw}}`); reuses `chat/util.js`, `math-logic.js`, `markdown.js` and the vendor scripts. (`webview/chat/btw.js`, the in-thread card, was removed.)

## webview/vendor/
- `marked.umd.js`, `marked.LICENSE.md`, `highlight.min.js`, `powershell.min.js`, `highlight.LICENSE`, `katex/` (`katex.min.js`, `katex.min.css`, `fonts/*.woff2`, `LICENSE`) — see DEPENDENCIES.md. Test: `test/math-logic.test.js`.

## resources/
- `claude-mascot.svg` — the Claude Code mascot, full colour (editor-title button, tab icon).
- `claude-mascot-mono.svg` — the mascot in `currentColor` (view containers).

## dev/ — development only (not packaged)
- `README.md` — how to run the probes, the gateway probe, the fake CLI and the browser preview.
- `claude-code-vscode-guide-he.html` — Hebrew guide to the official extension's features (reference for `PLAN.md`).
- `open-checks.txt` — Hebrew: the single list of open user checks. `check-7.html` — interactive checklist for check 7 and the usage gauge (7.6). `check-all.txt` — the full Hebrew check pack (setup, unit tests, `/btw`, file tagging "בדיקה 8", model switch, everything built so far) with step-by-step instructions. `check-model-switch.txt` — Hebrew check of F-8/F-9 on the user's CLI (log lines, `/api/ps`). `check-ide-server.txt` — Hebrew user-run check of our IDE server (UTF-8 BOM, CRLF; rename to `.ps1` to run): lists the locks with pid/port state; `-Probe` runs `claude-bin.exe` once with `CLAUDE_CODE_SSE_PORT` and prints the CLI's MCP servers. `must-check.txt` — the one detailed Hebrew step-by-step check file for the work machine (UTF-8 BOM, CRLF): prep, IDE-server/`openDiff` decisive check, `ExitPlanMode`, check-all 7 and 8, navigation, usage gauge/model switch, and the 2026-11-09 features (section 7). Removed 2026-11-08 as superseded (`CHANGELOG.md`): `check-at-mention`, `check-btw*`, `check-cli`, `check-context-window`, `check-ide.txt/.ps1`, `check-mcp-tools`, `run-cli-checks`.
- `fake-claude.js` / `.cmd` — fake stream-json CLI (scenarios `tool`, `שאלה`, `slow`, `edit`, `background`, `tasks`, `agent`, `loop` with `FAKE_CLAUDE_LOOP_MS`; `FAKE_CLAUDE_NO_TOOLS_MODEL`; `--settings` env over `FAKE_CLAUDE_USER_SETTINGS_ENV`; default model `fake-model[1m]` unless 1M is off; answers `get_context_usage`).
- `manual-tests.html` — Hebrew manual test checklist.
- `preview-server.js`, `preview-host.js`, `preview-theme.css` — browser preview with a simulated host (several conversations, drawer, restore, MCP, bars; URL params `?conv=c2`, `?open=drawer|mcp|slash|attach|mode`, `?theme=light`).
- `probe-cli.js` — first CLI feasibility probe (needs the repo); `probe-standalone.js`, `probe2-standalone.js`, `probe3-standalone.js` — self-contained probes against the real CLI (checks `p1`-`p8`, `q1`-`q10`, `s1`-`s5`).
- `probe4-standalone.js` — self-contained probe: background tasks, Task tools, sub-agents, cron tools.
- `probe-mcp-standalone.js`, `run-h-checks.ps1`, `email/` (`HOW-TO-RUN.txt`, `probe-mcp-standalone.txt`, `run-h-checks.txt` = e-mail copies) — the package H transport/token pre-check run on another machine (`PLAN.md` section 6 item 10).
- `gateway-probe/` — dev-only VS Code extension (`package.json`, `extension.js`, `probe.js`) that checks the extension host can reach the model gateway.
- `nav-check/` — dev-only check of the eight navigation tools in real VS Code through the real nav server over HTTP: `runner.js` (37 checks with hand-written expected answers), `package.json` + `ext.js` (empty extension that loads it), `fixture/` (JS/React project with a same-named decoy module, multi-line, CommonJS, `import()`, side-effect and re-export imports, a commented import, a C# file), `outside.js` (path-limit check). Writes `nav-check-report.txt` (not committed).

## test/
- `tagging.test.js` — package K: the single mention function, dedupe, recent list, once-per-change (7 tests). `work-file.test.js` was deleted.
- `nav-results.test.js` (navigation card parse/title/render), `change-stats.test.js` (changes card counts), `trigger-token.test.js` (mid-sentence `/` and `@` tokens) — 2026-11-09.
- `blocks.test.js` — block diff, partial apply, Edit/Write review texts, the permission decision.
- `editor-context.test.js` — Alt+K `@path#lines`, chips and removal, context once per change, tool file paths.
- `args.test.js`, `process.test.js`, `env.test.js`, `keys.test.js`, `event-translator.test.js`, `transcripts.test.js`, `conversation.test.js` (stub `vscode`), `conversation-host.test.js` (F-2 with the fake CLI, hidden permission, close, open session, stale queue), `replay-log.test.js`, `drawer-logic.test.js`, `prompt-logic.test.js`, `mentions.test.js`, `session-model.test.js`, `panel-registry.test.js`, `mcp.test.js`, `error-card-uri.test.js`, `display.test.js`, `models.test.js`, `edit-log.test.js` (incl. the fake CLI "edit" scenario), `checkpoints.test.js`, `task-map.test.js`, `claude-tasks.test.js`, `agent-map.test.js`, `loop.test.js` (`loop-jobs`, `cron-next`, `self-turn`), `log-buffer.test.js`, `nav-server.test.js`, `nav-tools.test.js` (fake provider results for all eight tools, incl. the 2026-11-06 reliability fixes), `nav-vscode.test.js`, `ws-frames.test.js` (codec), `ide-server.test.js` (lock lifecycle in a temp dir, token/Origin refusal, MCP over a real socket). `usage-gauge.test.js` (Ollama window, breakdown, levels), `btw.test.js`, `btw-session.test.js`, `math-logic.test.js`. 287 tests in all (2026-11-09); all pass on Windows; on Linux `chmod +x dev/fake-claude.js` first.

## .claude/
- `launch.json` — "chat-preview" server config.
