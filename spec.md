# Spec — Claude Code Local (VS Code extension), as built

What the extension is and does today (the "basic version", v0.1.0). User decisions are recorded in `DECISIONS.md`; the roadmap for what comes next, with the reason for each decision, is `PLAN.md`; findings about the CLI and the environment are in `DEPENDENCIES.md`; the setup is in `SETUP.md`. Verification status of everything below: last section.

## Purpose & principles
- A VS Code extension that looks and behaves as close as possible to the official Claude Code extension: send a question, get the answer, render all formatting (Markdown, code with highlighting, thinking, tool rows). Basics only: conversation history of the open folder, the CLI's skills/commands, permissions, model and mode.
- **The CLI is the only source of truth. The extension is a front, not a store.** It holds no data of its own: no `globalState`, no `workspaceState`, no files it writes, no archive, groups, unread flags, local renames, or reload-restore state (user decision). Everything shown is either live from the running CLI process or read read-only from the CLI's own transcript files. In-memory state that dies with the window (open panels, the pending permission cards) is allowed; persisting it is not.
- The extension never talks to a model; the CLI does. The CLI decides about permissions; the extension only relays.
- Design matters: the UI mirrors the official extension's layout and visual language (see "Chat webview").

## Platform constraints
- A small extension of its own; nothing is copied from the older OneDrive project (user decision).
- Runs on Windows with VS Code and the real `claude` CLI installed (development also uses Node 22). Must eventually run on an offline machine: no CDNs or remote fonts from the webviews and no network access from the webviews. The extension host makes one exception (built in package D): a read-only `GET /v1/models` and `GET /v1/model/info` to the user's own model gateway, in memory only (`DECISIONS.md`, 2026-11-01).
- Language: plain JavaScript only. CommonJS (`require`) in the extension host, plain `<script>` files in the webview. No TypeScript, no `npm install`, no build step, no bundler.
- The only third-party code allowed is vendored, plain-JS, self-running files saved in the repo at a pinned version with their license files: `marked` (Markdown to HTML) and `highlight.js` (common-languages bundle) under `webview/vendor/` (`DEPENDENCIES.md`). Everything else is hand-written.
- `engines.vscode`: `^1.91.0` (VS Code 1.91.1 on the user's machine did not load the extension with the original `^1.94.0`). The secondary-sidebar container is used from 1.106 (the official extension's threshold, `src/util/vscode-version.js`); older versions fall back to the activity bar (see "Placement").
- The CLI is not bundled. It comes from `claudeLocal.claudePath` (default `claude`; on the user's machine the real `claude-bin.exe`, see `SETUP.md`). Target CLI: 2.1.181 or newer (built against 2.1.181; the user's machine runs 2.1.246). A bare name is resolved on PATH by scanning PATH x PATHEXT; a `.cmd`/`.bat` is run through `cmd.exe /d /s /c`.
- `capabilities.untrustedWorkspaces.supported: false`: the extension does not run in Restricted Mode.
- Ids are renamed so the extension installs side by side with the official one: commands `claude-local.*`, settings `claudeLocal.*`, views `claudeLocal*`, view containers `claude-local-*`, context keys `claude-local.*`.
- Code is separated by feature: a folder per topic under `src/` and `webview/`, no cross-feature spaghetti.
- Known limit: Ctrl+Shift+Esc is Windows' Task Manager shortcut, so it will probably never reach VS Code; kept as specified. Ctrl+Alt+C is a second binding for the same command (it works on Windows). The editor/title button, the status-bar item and the command palette are the working entry points. Ctrl+Esc (`claude-local.focusToggle`) normally opens the Windows Start menu; it is kept as decided and its conflict is an unverified user item (`SETUP.md` section 7: if the Start menu opens, rebind the command via "Claude Code Local: Keyboard Shortcuts").
- All VS Code-level shortcuts are `contributes.keybindings`, so they are rebindable in VS Code's shortcut editor; the command "Claude Code Local: Keyboard Shortcuts" opens `workbench.action.openGlobalKeybindings` filtered to `claude-local`. Shortcuts inside the chat webview are separate: the `claudeLocal.keybindings.*` settings (see "Chat webview").
- Code: `package.json`, `extension.js`, `.vscodeignore`, `src/util/vscode-version.js`.

## Manifest & package layout
- `package.json`: `name: claude-local`, version 0.1.0, `publisher: local`, `displayName: "Claude Code Local"`, `main: ./extension.js`, `categories: ["AI", "Chat"]`. No `icon` field (no PNG exists; the SVG logo is used for the commands and view containers). `activationEvents`: `onStartupFinished` (the status-bar item and the context keys must exist before anything is opened; commands and views activate implicitly). Declared `contributes` keys: `configuration`, `commands`, `keybindings`, `viewsContainers`, `views`, `menus`.
- `extension.js` only wires features: `activate(context)` builds the shared services (logger, settings reader, panel registry) and calls each feature's `register(context, services)`; `deactivate()` kills every CLI process.
- The tree, one line per file: `PROJECT_MAP.md`. Folders: `src/cli/` (the CLI process), `src/panels/` (one webview bound to one process), `src/history/` (read-only transcripts), `src/util/`, `webview/chat/`, `webview/vendor/`, `resources/claude-logo.svg` (hand-drawn spark), `dev/` (fake CLI, browser preview, probes; `dev/README.md`), `test/`.
- Not built yet: `scripts/package.ps1`, `resources/claude-logo.png`.

## Placement
Two places, each an independent conversation with its own CLI process (user decision).
- **Editor tab:** a `WebviewPanel`, viewType `claudeLocalPanel`, icon the Spark logo, title the first 40 characters of the first user message ("Claude" before one). Opened by an editor/title button (icon from `resources/claude-logo.svg`, `navigation`), the keybindings Ctrl+Shift+Esc / Ctrl+Alt+C, or the status-bar item. With `claudeLocal.lockEditorGroups` the new tab's group is locked (`workbench.action.lockEditorGroup` after creation).
- **Main button** (`editor.openLast`, the editor/title button and status-bar item): follows `claudeLocal.preferredLocation` (`panel` = the editor tab, `sidebar` = the sidebar view) and, with `claudeLocal.useTerminal`, opens the CLI in a terminal instead (`editor.open` follows `useTerminal` too).
- **Sidebar view:** `claudeLocalSidebarSecondary` in the `secondarySidebar` container `claude-local-sidebar-secondary` (shown when `!claude-local:doesNotSupportSecondarySidebar`), and `claudeLocalSidebar` in the `activitybar` container `claude-local-sidebar` (shown when `claude-local:doesNotSupportSecondarySidebar`, the fallback for old VS Code). At activation the extension sets that context key from `vscode.version`. Both views are `type: webview`.
- Commands (palette titles keep the English "Claude Code Local:" prefix plus a Hebrew title; every webview string is Hebrew):

  | Id | Title | Key (Win) | Notes |
  |---|---|---|---|
  | `claude-local.editor.open` | Open in New Tab | Ctrl+Shift+Esc, Ctrl+Alt+C | new conversation in an editor tab |
  | `claude-local.editor.openLast` | Open | — | editor/title button and status-bar target; focuses the last tab or opens one; hidden from the palette |
  | `claude-local.sidebar.open` | Open in Side Bar | — | reveals the sidebar view |
  | `claude-local.newConversation` | New Conversation | — | clears the current panel and starts a fresh process (disabled while a turn runs); also the "+" in the chat header |
  | `claude-local.terminal.open` | Open in Terminal | — | runs the CLI's original interface in a VS Code terminal (same resolved `claudePath`, cwd and merged environment; no stream-json flags) |
  | `claude-local.focusToggle` | Switch Between Editor and Chat | Ctrl+Esc | to the last text editor when a chat tab is active, otherwise opens the main chat; does not toggle back from the sidebar chat |
  | `claude-local.keyboardShortcuts` | Keyboard Shortcuts | — | opens the VS Code shortcut editor filtered to `claude-local` |
  | `claude-local.showLogs` | Show Logs | — | shows the OutputChannel "Claude Code Local" |

  `claude-local.newConversation` is also bound to Ctrl+N, only when `claudeLocal.enableNewConversationShortcut` is on and the focus is in the chat (`when`: `activeWebviewPanelId == 'claudeLocalPanel' || focusedView =~ /^claudeLocalSidebar/`), so VS Code's "New File" is not overridden elsewhere.

- Status bar: a right-side item "✻ Claude" running `claude-local.editor.openLast`; works without an open file.
- Tab title markers (in memory only; VS Code has no tab colour API, so an emoji prefix is added to the panel title): blue circle = waiting for permission, orange circle = finished while the tab was hidden (cleared when the tab is shown). The title otherwise stays the first 40 characters of the first user message.
- Closing a tab or disposing the sidebar view kills its process. Nothing is remembered: after a window reload no tab is restored (no `WebviewPanelSerializer`), and the conversation is reachable again through "past conversations".
- Code: `src/panels/` (`chat-panel.js`, `sidebar-view.js`, `panel-registry.js` (in-memory only), `commands.js`, `status-bar.js`, `index.js`), `src/cli/terminal.js` (Open in Terminal), `src/util/workspace.js` (`workspaceCwd`, shared by the chat and the terminal), `package.json` `contributes`.

## Process & protocol
One long-lived CLI process per conversation, spoken to over stdin/stdout with stream-json and the control protocol (user decision).
- Spawn: `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio --permission-mode <mode>`, plus `--resume <sessionId>` to continue a past conversation and `--model <m>` when the user picked one. No capability probing: the target CLI is fixed (2.1.181+), an unknown-flag failure is reported in Hebrew.
- `cwd`: the first workspace folder. No folder open: the user's home folder, and the composer shows "לא נפתחה תיקייה – Claude עובד בתיקיית הבית".
- Environment: `process.env`, then `claudeLocal.environmentVariables` merged over it (default `API_TIMEOUT_MS=1200000`, `CLAUDE_ENABLE_STREAM_WATCHDOG=0`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`; values coerced to strings, invalid entries ignored; applies from the next process start), then `CLAUDE_CODE_ENTRYPOINT=claude-local-vscode`. The same merged environment is used by Open in Terminal. Model-server variables (`ANTHROPIC_BASE_URL` etc.) stay in the user's own environment or `~/.claude/settings.json`, not in an extension setting (`SETUP.md`). Known limit: VS Code replaces the whole object when the user sets one key, so a user value must list every variable they still want.
- Start: the process is spawned when the webview sends `ready`, then the extension sends the `initialize` control request (60 s timeout). Its response is the source for the `/` commands, the models, the agents and the account: keys `commands[{name, description, argumentHint}]`, `agents`, `output_style`, `available_output_styles`, `models[{value, displayName, description, ...}]`, `account`, `pid`.
- Control requests sent: `initialize`, `interrupt`, `set_permission_mode`, `get_context_usage` (after initialize and after each result). `set_model` is no longer sent: a model change restarts the process. Received: `can_use_tool` (permission cards). An unknown incoming request is answered with an error response; an outgoing request the CLI rejects is logged and the UI keeps its previous state.
- Stop button: pending permission cards are denied with "Interrupted by the user" and `interrupt` is sent; a process still alive 6 s later is killed (`taskkill /T /F` on Windows). A stopped turn shows "■ הופסק" (never an error); if the CLI sends no `result` within 4 s after the interrupt acknowledgement, the turn is closed locally so the stop button never hangs. (Against CLI 2.1.246 the `result` arrives in about 0.5 s and the process stays alive, so the 4 s wait is only a fallback.)
- Bypass mode: switching to `bypassPermissions` works only when the process was launched with `--allow-dangerously-skip-permissions`; `buildArgs` adds that flag when `claudeLocal.allowDangerouslySkipPermissions` is on. A failed `set_permission_mode` shows a Hebrew notice and the UI keeps the previous value.
- Failures add a Hebrew error to the conversation: spawn failure ("לא ניתן להפעיל את Claude (…). בדוק את ההגדרה claudeLocal.claudePath."), unknown option ("גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח."), else exit code + the last 3000 characters of stderr.
- Every line in and out is logged at debug level to the OutputChannel, message contents cut to 500 characters.
- Lifetime: killed when its panel or view is disposed or the extension deactivates.
- Code: `src/cli/` (`args.js`, `spawn.js`, `env.js` (environment merge), `terminal.js`, `process.js` with `send`/`request`/`respond`/`respondError`/`interrupt`/`kill`, `content.js`), `dev/fake-claude.js` (+ `.cmd`; `dev/README.md`), `test/args.test.js`, `test/env.test.js`, `test/process.test.js`.

## Chat webview
- One HTML shell for both surfaces (`webview/chat/index.html`), `dir="rtl" lang="he"`. Layout and visual language mirror the official extension: a header (title, "שיחות קודמות", "+"), a scrolling thread, a composer at the bottom with a footer row (mode selector, model picker, stop/send). Colors come only from VS Code theme variables (`--vscode-editor-background`, `--vscode-foreground`, `--vscode-button-*`, `--vscode-textCodeBlock-background`, …) so it follows light, dark and high-contrast themes. Fonts: the editor/UI fonts via `--vscode-font-family` / `--vscode-editor-font-family`.
- Direction: the shell is RTL; code, paths, commands and tool names are LTR islands (`dir="ltr"`, `unicode-bidi: isolate`); message paragraphs use `dir="auto"` so English text reads correctly.
- Security: CSP `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-<random>'; font-src ${webview.cspSource}`; `localResourceRoots` = `webview/` and `resources/` only; `enableScripts: true`, `retainContextWhenHidden: true` (a hidden tab keeps streaming).
- Host <-> webview messages (`postMessage`, every message `{type, ...}`):

  | Direction | type | Payload |
  |---|---|---|
  | webview -> host | `ready` | — (host spawns the process, replies with `init`) |
  | host -> webview | `init` | initial state (settings, modes, session) |
  | host -> webview | `settings` / `notice` | live setting values; a Hebrew notice line (e.g. a failed `set_model`) |
  | host -> webview | `commands` / `models` | from the `initialize` response (sent when it arrives) |
  | host -> webview | `mode` / `model` | the value the CLI confirmed (or the previous one after a failure) |
  | webview -> host | `send` | `{text}` |
  | webview -> host | `interrupt` | — |
  | webview -> host | `setMode` / `setModel` | `{value}` |
  | host -> webview | `events` | a batch of translated stream events (text delta, thinking, tool start/result, assistant message end, result, error) |
  | host -> webview | `busy` | turn running or finished |
  | host -> webview | `permission` | `{requestId, tool, input, toolUseId, suggestions (bool), reason}` |
  | host -> webview | `permissionCancelled` | `{requestId}` (denied on stop) |
  | webview -> host | `permissionAnswer` | `{requestId, behavior: allow\|deny, always?, message?, updatedInput?}` |
  | host -> webview | `reset` / `focus` | clear the thread for a new conversation; focus the composer |
  | webview -> host | `listHistory` / host -> webview `history` | `{items: [{id, title, mtime}]}` |
  | webview -> host | `openSession` | `{id}` |
  | host -> webview | `sessionLoaded` | `{id, items}` (earlier messages read from the transcript) |
  | webview -> host | `openFile` | `{path, line?}` (file paths in tool rows) |
  | webview -> host | `openLink` | `{url}` (http/https only) |
  | webview -> host | `newConversation` | — |

- Thread content:
  - User messages.
  - Assistant text streamed token by token and rendered as Markdown with `marked`: headings, lists, tables, blockquotes, links, inline code, fenced code. Raw HTML in Markdown is escaped, never injected; links are opened only through the host (`openLink`, http/https).
  - Fenced code blocks: LTR, highlighted with `highlight.js`, a language label and a copy button.
  - Thinking: collapsed by default, expandable. (The local model produces no thinking blocks.)
  - Tool rows: tool name + a one-line summary (file path, command, pattern), expandable to the full input and the result; file paths open the file.
  - Result line when the `result` message arrives: duration and tokens ("תור: קלט X · פלט Y"), each only when given. No cost (the CLI's cost is meaningless with a local model; removed in package D).
  - Context meter in the composer: "הקשר: 23,400 / 64,000" from `get_context_usage` (`totalTokens` / `maxTokens`), refreshed after each result; red at 85% and above; a click sends `/compact`; disabled during a turn. The window is `CLAUDE_CODE_MAX_CONTEXT_TOKENS` from `environmentVariables`.
  - Errors in Hebrew (see "Process & protocol").
  - During a turn a spinner with a Hebrew verb ("חושב…") and the stop button.
- Composer: by default Enter sends and Shift+Enter is a new line. The keys come from the settings `claudeLocal.keybindings.send` / `newLine` / `rewind` (defaults `Enter`, `Shift+Enter`, `Escape Escape`; a key combination like `Ctrl+Enter` or a space-separated sequence), matched in the webview (not read from VS Code's keybindings). `claudeLocal.useCtrlEnterToSend` stays for compatibility and swaps the `send` and `newLine` defaults (Ctrl+Enter sends, Enter is a new line); it applies only while the two settings are at their defaults. The `rewind` key is parsed and matched but only fires the hook `CL.composer.onRewind`; the action arrives with checkpoints (package B). While a turn runs the send button becomes stop. Footer: mode selector, model picker.
- Model picker: the first choice is "ברירת מחדל" (the CLI default, no `--model`), then the gateway's model ids (`GET <base>/v1/models` + `/v1/model/info`, 5 s timeout, in memory; base = `claudeLocal.gatewayUrl`, else `ANTHROPIC_BASE_URL` from `environmentVariables`, the process environment, or `~/.claude/settings.json` `env`, last). Hidden: models with `litellm_params.extra_body.output_config.format` and those in `claudeLocal.modelDenylist`. If the fetch fails, the current model stays, a Hebrew notice is shown and the fetch is retried at the next process start. A change kills the process and restarts it with `--model <id>`, `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL=<id>` and `--resume <sessionId>`. A result with "does not support tools" shows a Hebrew notice and restarts once on the previous model.
- During a turn the model and mode pickers are disabled (the host also refuses `setModel` / `setMode` with a Hebrew notice). The button "⏹ עצירה והחלפת מודל" shows a modal Hebrew warning (partial answer lost, a running tool cut mid-way so a file may be half-written, a pending permission request denied), then interrupts and switches when the turn ends.
- Known limits (all planned in `PLAN.md`): no image paste, attachments, @-mentions, editor context, focus view, timestamps.
- Code: `src/panels/` (`webview-html.js`, `message-router.js`, `event-translator.js`, `conversation.js`), `webview/chat/` (`index.html`, `chat.css`, `highlight-theme.css`, `keys.js` (key-spec parsing and matching), `util.js`, `markdown.js`, `tools.js`, `thread.js`, `cards.js`, `menu.js`, `composer.js`, `app.js`), `webview/vendor/`.

## History (past conversations)
The CLI's transcripts are the only store; the extension reads them read-only (user decisions).
- Source: `~/.claude/projects/<encoded cwd>/*.jsonl` (`CLAUDE_CONFIG_DIR` respected; the cwd is encoded by replacing every non-alphanumeric character with `-`; checked: "C:\AI projects\X" becomes "C--AI-projects-X") for the conversation's `cwd`. Per file: id (file name without `.jsonl`), title, last activity (file mtime). Title rule: the CLI's own custom title (set by `/rename` or the app) wins, then a `summary` line, then the first real user message (60 characters). Titles can appear late in a file, so the head and the tail (64 KB each) are read. Newest first; no message count (would need a full read).
- UI: a "שיחות קודמות" button in the chat header opens a searchable list grouped "היום", "אתמול", "השבוע", "קודם" (by mtime, local time). Search filters by title. An empty state says "אין שיחות קודמות בתיקייה הזו". The same list is also a dedicated Activity Bar view (next bullet).
- **Sessions view (package B1):** the activity-bar container `claude-local-history` holds the TreeView `claudeLocalHistory`: past conversations of the open folder (read-only, same `listSessions` source and titles), newest first, and open conversations marked. Temporary in-memory filter (all / active / waiting / finished): waiting = open with a pending permission card, active = open and busy, finished = everything else including conversations that are not open. A suggestion row "continue the last conversation" (the newest transcript) appears only when no conversation is open and the filter is "all". Rename sends `/rename <title>` as ordinary user text to the CLI (a conversation that is not open is resumed first); the extension never writes a transcript. Reopen closed: an in-memory list (max 10, session id and title only, lost on reload) behind Ctrl+Shift+T, bound only when `claude-local:hasClosed && (activeWebviewPanelId == 'claudeLocalPanel' || activeEditor == '')` so VS Code's own reopen-closed-editor keeps working for files. Commands: `claude-local.history.open/refresh/filter/rename`, `claude-local.reopenClosed`, `claude-local.continueLast`. Filters, the closed list and the tab markers are in-memory state only (allowed by "Purpose & principles"); nothing is persisted.
- Opening a past conversation: the earlier messages are read from its jsonl and rendered with the same renderer as live ones (user text, assistant text as Markdown, thinking, tool rows; sidechain, meta and system-injected entries skipped), then the process is started with `--resume <id>` so the next message continues it.
- Where it opens: if the current panel holds no conversation yet (no messages), it is reused; otherwise (messages present, or a turn running) the past conversation opens in a new editor tab. If the same session id is already open in a tab of this window, that tab is focused instead (an in-memory check only).
- Read-only guarantee: the extension never writes, renames, deletes or archives a transcript.
- Code: `src/panels/session-model.js`, `src/panels/history-tree.js` (sessions view), `src/history/` (`transcripts.js` with `listSessions` / `readSession` / `sessionTitle`, `transcript-events.js`), `src/cli/content.js`, `webview/chat/history.js`, `test/transcripts.test.js`.

## Skills / commands menu
- Typing `/` at the start of the composer opens a menu listing the CLI's commands from the `initialize` response (`name`, `description`, `argumentHint`), filtered as you type; arrows move, Enter/Tab/click insert `/<name> ` into the composer, Esc closes. The CLI executes it when the message is sent. This includes the user's skills, since the CLI lists them as commands. There is no separate skills button.
- If the `initialize` response has not arrived yet or has no commands, typing `/` shows nothing.
- The menu is grouped: commands, skills (names from `system/init` `skills`), and "בטרמינל בלבד" (from `terminal_slash_commands`, default `doctor`, `color`), the last greyed out. Choosing or typing a terminal-only command shows a Hebrew card with an open-in-terminal button and never sends it. `/plan` and `/plan open` are handled by the extension and never sent.
- `@` opens a files-and-folders menu (host: `src/panels/mentions.js`, honours `.gitignore` through `git ls-files` when `respectGitIgnore`). Alt+K (`claude-local.insertAtMention`) inserts `@path` of the open file.
- While a turn runs, new messages wait in memory as grey "ממתין" bubbles that can be cancelled and are sent one by one when the turn ends; the up arrow browses this conversation's sent messages; each answer has a copy button; pasted or dropped images are attached (any model) and sent as image blocks; files dragged in become `@path`.
- The plan (assistant text before `ExitPlanMode`) opens as a read-only virtual Markdown document (`src/panels/plan-doc.js`).
- Auto mode is in the mode picker with a Hebrew warning.
- Code: `webview/chat/slash-menu.js` (shared list behaviour in `webview/chat/menu.js`).

## Permissions & modes
The CLI decides; the extension only relays (user decision).
- Permission card for every `can_use_tool`: the tool name, its input (expandable), and buttons "אישור", "אישור תמיד" (only when the CLI sent `permission_suggestions`; answers allow with those suggestions as the updated permissions), "דחייה" (with an optional reason). Cards stay in the thread until answered; pending cards are denied on stop.
- `ExitPlanMode` (needed for plan mode to be usable) shows the plan as rendered Markdown with "אישור התוכנית" / "המשך תכנון". `AskUserQuestion` has a real option picker: the chosen answers go back as `updatedInput.answers`, keyed by question text, because a plain "allow" would return no answers.
- Mode selector in the composer footer: "ידני" (`default`), "עריכה אוטומטית" (`acceptEdits`), "תכנון" (`plan`), and "ללא הרשאות" (`bypassPermissions`) only when `claudeLocal.allowDangerouslySkipPermissions` is on. The start mode is `default`. A live change sends `set_permission_mode`; the selector shows the mode the CLI confirms. The selector is disabled during an active turn.
- Known limits: no native diff review — file edits are approved from the permission card (the input shows `old_string`/`new_string`/`content`).
- Code: `webview/chat/cards.js` (permission, plan and question cards), `src/panels/conversation.js` (`onControlRequest`, `answerPermission`, `denyAllPending`), `src/panels/message-router.js`.

## Settings
VS Code settings are user configuration, not conversation data, so they do not conflict with the no-storage rule. Configuration title "Claude Code Local"; descriptions in Hebrew. The settings still planned are in `PLAN.md` section 4.

| Setting | Type, default | Meaning |
|---|---|---|
| `claudeLocal.claudePath` | string, `claude` | the CLI executable; on the user's machine the full path to `claude-bin.exe` (never `claude.cmd`, `SETUP.md` section 4) |
| `claudeLocal.allowDangerouslySkipPermissions` | boolean, false | shows "ללא הרשאות" in the mode selector |
| `claudeLocal.useCtrlEnterToSend` | boolean, false | Ctrl+Enter sends, Enter is a new line (swaps the `send`/`newLine` defaults) |
| `claudeLocal.gatewayUrl` | string, "" | gateway address for the model list; empty = taken from `ANTHROPIC_BASE_URL` |
| `claudeLocal.modelDenylist` | string[], `["gemma3:27b"]` | models hidden from the picker |
| `claudeLocal.environmentVariables` | object name to string, `{API_TIMEOUT_MS: "1200000", CLAUDE_ENABLE_STREAM_WATCHDOG: "0", CLAUDE_CODE_MAX_CONTEXT_TOKENS: "64000"}` | environment of the CLI process (chat and terminal), merged over the VS Code environment |
| `claudeLocal.preferredLocation` | `panel` / `sidebar`, `panel` | where the main button opens the chat (`panel` = editor tab) |
| `claudeLocal.lockEditorGroups` | boolean, false | lock the chat tab's editor group |
| `claudeLocal.useTerminal` | boolean, false | the main button and Ctrl+Shift+Esc open the CLI in a terminal |
| `claudeLocal.enableNewConversationShortcut` | boolean, false | Ctrl+N starts a new conversation while the chat has focus |
| `claudeLocal.keybindings.send` / `.newLine` / `.rewind` | string, `Enter` / `Shift+Enter` / `Escape Escape` | shortcuts inside the chat webview |

- Changes apply live; `claudePath` and `environmentVariables` apply to the next process start and the chat says "ההגדרה תחול בשיחה הבאה".
- Code: `package.json` `contributes.configuration`, `src/util/settings.js`, `src/cli/env.js`, `webview/chat/keys.js`.

## Testing
- Automated: `node --test "test/*.test.js"` (run in PowerShell; Node 22 needs the glob, a bare folder does not work). Tests: `args`, `process`, `env`, `keys`, `event-translator`, `transcripts`, `conversation` (with a stub `vscode` module), `session-model`, `panel-registry`. `dev/fake-claude.js` (+ `.cmd`) is a fake stream-json CLI that answers `initialize` (commands, models), streams a reply with partial messages, asks `can_use_tool`, and honours `interrupt`; selected with `claudeLocal.claudePath`. Units: args building, process/control protocol over a pipe to the fake CLI, transcript reading, the event translator.
- `node --check` on every `.js` file and a JSON check of `package.json`.
- Manual: Extension Development Host (`code --extensionDevelopmentPath=<repo>`), first against the fake CLI, then the real CLI. Checklist: open a tab, the sidebar and the status-bar item; Ctrl+Shift+Esc; a question streams and renders Markdown, a table, highlighted code with copy; thinking collapses; a tool row expands; a permission card (allow, always, deny); mode and model change; stop; "past conversations" lists this folder's chats, opening one shows its earlier messages and a new message continues it; `/` menu lists the CLI's commands; Hebrew text and mixed English render correctly in RTL; light, dark and high-contrast themes; open Help > Toggle Developer Tools > Console and check that no message contains "Refused to" or "Content Security Policy"; Developer: Reload Window and see what happens to the chat tab; the sidebar view appears in the activity bar on VS Code 1.91 (no secondary sidebar there). A failure is reported with the console text and Output > "Claude Code Local".
- Browser preview (dev-only, no VS Code): `dev/preview-server.js` + `dev/preview-host.js` serve the webview with a simulated host (`.claude/launch.json` "chat-preview"); used to check rendering and layout.

## Verification status (2026-11-01)
- **Verified:**
  - Unit tests: 71/71 pass (after package D; adds `models` (6) and 5 `conversation` tests: model switch, busy refusal, no-tools revert, context usage). Package D is covered by unit tests and the fake CLI only. (Earlier: 60/60 after package B1; adds `session-model`, `panel-registry` and two `conversation` tests). Package B1 (filters, closed list, tab markers, continue suggestion, rename call) is covered by unit tests only; the container, tree, Ctrl+Shift+T, tab title markers and `/rename` as user text against the real CLI are **not verified** in real VS Code. (Previously: 46/46 after package C part 1-3.) Package C logic (grouping, queue, history, mention ranking, image check) is covered by unit tests only. Package A (environment merge, key parsing/matching, process env) is covered by unit tests only.
  - The webview in a browser preview (dark and light themes): streaming Markdown, tables, highlighted code, tool rows with an Edit diff, permission approve, the `/` menu, the mode menu, the history panel, loading a past session.
  - On the user's machine (CLI 2.1.246, VS Code 1.91.1, local model `qwen3.8:27b`): the extension loads, runs and answers; against the real CLI (`DEPENDENCIES.md`): `interrupt` (the `result` arrives in about 0.5 s, the process stays alive), `--resume` and `--fork-session`, `AskUserQuestion` answers through `updatedInput.answers`, queued messages, MCP control requests, `get_context_usage`, file rewind, `updatedInput` on Edit, auto mode, `--model` at launch.
- **Not verified:**
  - Package D: the 64,000 window for `qwen3.8:27b` (the user runs `dev/check-context-window.txt`, `PLAN.md` section 6 item 2); everything in real VS Code; restart with `--model` and `--resume` together on the real CLI (each flag verified separately); the `/v1/model/info` JSON shape (assumed LiteLLM's `{data:[{model_name, litellm_params}]}`).
  - Package C inside real VS Code and against the real CLI: Auto mode picker, the grouped menu with real `system/init` data, queue/history behaviour, `@` completion, Alt+K, `/plan open` document, image paste and drag/drop, whether the CLI expands `@path` in stream-json. Not built: `/btw`, LaTeX.
  - Package A inside real VS Code: all the new `vscode`-API commands (terminal, `lockEditorGroup`, `focusToggle`, `keyboardShortcuts`), the Ctrl+N `when` clause (`activeWebviewPanelId` / `focusedView`), forwarding of webview keys, and the Ctrl+Esc conflict with the Windows Start menu (a user item: `SETUP.md` section 7).
  - Inside VS Code: the full manual checklist above; the CSP and `localResourceRoots` in a real webview; the high-contrast theme; Hebrew/English mixed text; what happens to a chat tab after Reload Window (no serializer); the sidebar view and status-bar item in every case.
  - Against the real CLI: the exact `can_use_tool` shapes and response fields for Write/Bash/`ExitPlanMode` as the extension handles them (probes saw the shapes; the extension's cards were exercised only with the fake CLI and the preview); the plan-approval buttons do not appear in VS Code (low priority, check last).
  - Packaging: `scripts/package.ps1` is not built.
  - The wider list of open items: `PLAN.md` section 6 and `DEPENDENCIES.md` section 5.
- Manual checks are reported as not done until they actually run.
