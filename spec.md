# Spec — Claude Code Local (VS Code extension), first milestone: "basic version"
_Created 2026-10-30, before any code. Source of the user decisions: AskUserQuestion answers of 2026-10-29/30 (recorded in DECISIONS.md). Structure and wording follow the older spec at `C:\Users\user\OneDrive\מסמכים\AI projects\Work\Software\Ai\claude-vscode\spec.md`, whose code was never run and is NOT reused (ideas only). `plan.md` in this repo describes the older four-milestone scope and is left unchanged; this spec supersedes it for the first milestone._

Every section is "planned" until code ships; when it ships the section is updated to "as built" with its real file list.

**Status (2026-10-30): the basic version is built and passed Stage 3 (Verify) with GO after one fix round; sections below are "as built" unless marked otherwise.** Verified: unit tests 22/22 (`node --test "test/*.test.js"`), the webview in a browser preview (dark and light), and activation without errors in a real VS Code 1.143.1 Extension Development Host. NOT verified: a real model reply (the `claude` CLI on this machine is not logged in: `claude auth status` gives `loggedIn:false`; run `claude auth login`), a conversation inside VS Code itself, the CSP in a real webview, real CLI behaviour after `interrupt`, and the manual checklist in "Testing". Deferred: `scripts/package.ps1`.

**Status update (2026-11-01):** on the user's machine (CLI 2.1.246 with a local model, VS Code 1.91.1) the extension runs and answers, and several items listed above as "not verified" were checked against the real CLI: `interrupt` returns a `result` within about 0.5 s and the process stays alive; `--resume` and `--fork-session` work; `AskUserQuestion` answers via `updatedInput.answers` work. Still not verified: the CSP in a real webview, the full manual checklist, the exact `can_use_tool` shapes for Write/Bash/ExitPlanMode. The feature roadmap and all findings are in `docs/features-plan.md`; setup changes are in `SETUP.md` section 5. The sections below are otherwise unchanged.

## Purpose & principles
- A VS Code extension that looks and behaves as close as possible to the official Claude Code extension: send a question, get the answer, render all formatting (Markdown, code with highlighting, thinking, tool rows). Basics only: conversation history of the open folder, the CLI's skills/commands, permissions, model and mode.
- **The CLI is the only source of truth. The extension is a front, not a store.** It holds no data of its own: no `globalState`, no `workspaceState`, no files it writes, no archive, groups, unread flags, local renames, or reload-restore state (user decision). Everything shown is either live from the running CLI process or read read-only from the CLI's own transcript files. In-memory state that dies with the window (open panels, the pending permission cards) is allowed; persisting it is not.
- The extension never talks to a model; the CLI does. The CLI decides about permissions; the extension only relays.
- Design matters: the UI mirrors the official extension's layout and visual language (see "Chat webview").

## Platform constraints
- A new, small extension in this repo; nothing is copied from the OneDrive project (user decision).
- Runs on Windows with VS Code, Node 22 and the real `claude` CLI installed (this machine has all three). Must eventually run on an offline machine: no network calls, CDNs, or remote fonts from the webviews; no network access at runtime from the extension itself.
- Language: plain JavaScript only. CommonJS (`require`) in the extension host, plain `<script>` files in the webview. No TypeScript, no `npm install`, no build step, no bundler.
- The only third-party code allowed is vendored, plain-JS, self-running files saved in the repo at a pinned version with their license files: `marked` (Markdown to HTML) and `highlight.js` (common-languages bundle) under `webview/vendor/`. Everything else is hand-written.
- `engines.vscode`: `^1.91.0` (lowered from ^1.94.0 on 2026-11-01: VS Code 1.91.1 on the user's machine did not load the extension; it now runs there). Secondary-sidebar placement needs a newer VS Code; older versions fall back to the activity bar (see "Placement").
- The CLI is not bundled. It comes from `claudeLocal.claudePath` (default `claude`). Target CLI: 2.1.181 (verified on this machine) or newer. A bare name is resolved on PATH by scanning PATH x PATHEXT; a `.cmd`/`.bat` is run through `cmd.exe /d /s /c`.
- `capabilities.untrustedWorkspaces.supported: false`: the extension does not run in Restricted Mode.
- Ids are renamed so the extension installs side by side with the official one: commands `claude-local.*`, settings `claudeLocal.*`, views `claudeLocal*`, view containers `claude-local-*`, context keys `claude-local.*`.
- Code is separated by feature: a folder per topic under `src/` and `webview/`, no cross-feature spaghetti.
- Known limit: Ctrl+Shift+Esc is Windows' Task Manager shortcut, so it will probably never reach VS Code; kept as specified. The editor/title button, the status-bar item and the command palette are the working entry points.
- Known limit: `engines.vscode` is `^1.91.0`, and the `secondarySidebar` container is used from 1.106 (the official extension's threshold, `src/util/vscode-version.js`); older versions use the activity-bar fallback.
- Code (as built): `package.json`, `extension.js`, `.vscodeignore`, `src/util/vscode-version.js`.

## Manifest & package layout
- `package.json` (as built): `name: claude-local`, version 0.1.0, `publisher: local`, `displayName: "Claude Code Local"`, `main: ./extension.js`, `categories: ["AI", "Chat"]`. No `icon` field (no PNG exists; the SVG logo is used for the commands and view containers). `activationEvents`: `onStartupFinished` (the status-bar item and the context keys must exist before anything is opened; commands and views activate implicitly). Declared `contributes` keys: `configuration`, `commands`, `keybindings`, `viewsContainers`, `views`, `menus`.
- `extension.js` only wires features: `activate(context)` builds the shared services (logger, settings reader, panel registry) and calls each feature's `register(context, services)`; `deactivate()` kills every CLI process.
- Tree as built (see PROJECT_MAP.md for one line per file):
  - `extension.js`, `package.json`, `.vscodeignore`
  - `src/cli/` — `args.js`, `spawn.js`, `process.js`, `content.js` (content-block helpers shared by the live stream and the transcript reader)
  - `src/panels/` — `conversation.js` (one webview + one CLI process), `message-router.js`, `event-translator.js`, `webview-html.js`, `panel-registry.js`, `chat-panel.js`, `sidebar-view.js`, `commands.js`, `status-bar.js`, `index.js`
  - `src/history/` — `transcripts.js`, `transcript-events.js`
  - `src/util/` — `logger.js`, `settings.js`, `nonce.js`, `paths.js`, `vscode-version.js`
  - `webview/chat/` — `index.html`, `chat.css`, `highlight-theme.css`, `util.js`, `markdown.js`, `tools.js`, `thread.js`, `cards.js`, `menu.js`, `slash-menu.js`, `composer.js`, `history.js`, `app.js`
  - `webview/vendor/` — `marked.umd.js` 12.0.2 + `marked.LICENSE.md`; `highlight.min.js` 11.9.0 + `powershell.min.js` + `highlight.LICENSE` (see DEPENDENCIES.md)
  - `resources/claude-logo.svg` (hand-drawn spark)
  - `dev/` — `fake-claude.js` + `fake-claude.cmd`; dev-only browser preview: `preview-server.js`, `preview-host.js`, `preview-theme.css` (started via `.claude/launch.json` "chat-preview")
  - `test/` — `args`, `process`, `event-translator`, `transcripts`, `conversation` tests
  - Not built yet: `scripts/package.ps1`, `resources/claude-logo.png`.
- Code (as built): `package.json`, `extension.js`.

## Placement
Two places, each an independent conversation with its own CLI process (user decision).
- **Editor tab:** a `WebviewPanel`, viewType `claudeLocalPanel`, icon the Spark logo, title the first 40 characters of the first user message ("Claude" before one). Opened by an editor/title button (`$(sparkle)`-style icon from `resources/claude-logo.svg`, `navigation`), the keybinding Ctrl+Shift+Esc, or the status-bar item.
- **Sidebar view:** `claudeLocalSidebarSecondary` in the `secondarySidebar` container `claude-local-sidebar-secondary` (shown when `!claude-local:doesNotSupportSecondarySidebar`), and `claudeLocalSidebar` in the `activitybar` container `claude-local-sidebar` (shown when `claude-local:doesNotSupportSecondarySidebar`, the fallback for old VS Code). At activation the extension sets that context key from `vscode.version`. Both views are `type: webview`.
- Commands (palette titles keep the English "Claude Code Local:" prefix plus a Hebrew title; every webview string is Hebrew):

  | Id | Title | Key (Win) | Notes |
  |---|---|---|---|
  | `claude-local.editor.open` | Open in New Tab | Ctrl+Shift+Esc | new conversation in an editor tab |
  | `claude-local.editor.openLast` | Open | — | editor/title button and status-bar target; focuses the last tab or opens one; hidden from the palette |
  | `claude-local.sidebar.open` | Open in Side Bar | — | reveals the sidebar view |
  | `claude-local.newConversation` | New Conversation | — | clears the current panel and starts a fresh process (disabled while a turn runs); also the "+" in the chat header |
  | `claude-local.showLogs` | Show Logs | — | shows the OutputChannel "Claude Code Local" |

- Status bar: a right-side item "✻ Claude" running `claude-local.editor.openLast`; works without an open file.
- Closing a tab or disposing the sidebar view kills its process. Nothing is remembered: after a window reload no tab is restored (no `WebviewPanelSerializer`), and the conversation is reachable again through "past conversations".
- Not verified: opening a tab, the sidebar view and the status-bar item inside VS Code (extension activation was checked in a real VS Code 1.143.1 Extension Development Host; no conversation was run); how VS Code treats an unrestorable webview tab on reload without a serializer.
- Code (as built): `src/panels/` (`chat-panel.js`, `sidebar-view.js`, `panel-registry.js` (in-memory only), `commands.js`, `status-bar.js`, `index.js`), `package.json` `contributes`.

## Process & protocol
One long-lived CLI process per conversation, spoken to over stdin/stdout with stream-json and the control protocol (user decision).
- Spawn: `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages --permission-prompt-tool stdio --permission-mode <mode>`, plus `--resume <sessionId>` to continue a past conversation and `--model <m>` when the user picked one. No capability probing: the target CLI is fixed (2.1.181+), an unknown-flag failure is reported in Hebrew.
- `cwd`: the first workspace folder. No folder open: the user's home folder, and the composer shows "לא נפתחה תיקייה – Claude עובד בתיקיית הבית".
- Environment: `process.env` + `CLAUDE_CODE_ENTRYPOINT=claude-local-vscode`. Model-server variables come from the user's own environment or `~/.claude/settings.json`, not from an extension setting.
- Start: the process is spawned when the webview sends `ready`, then the extension sends the `initialize` control request (60 s timeout). Its response is the source for the `/` commands, the models, the agents and the account: keys `commands[{name, description, argumentHint}]`, `agents`, `output_style`, `available_output_styles`, `models[{value, displayName, description, ...}]`, `account`, `pid` (verified on this machine with CLI 2.1.181).
- Control requests sent: `initialize`, `interrupt`, `set_permission_mode`, `set_model`. Received: `can_use_tool` (permission cards). An unknown incoming request is answered with an error response; an outgoing request the CLI rejects is logged and the UI keeps its previous state.
- Stop button: pending permission cards are denied with "Interrupted by the user" and `interrupt` is sent; a process still alive 6 s later is killed (`taskkill /T /F` on Windows). A stopped turn shows "■ הופסק" (never an error); if the CLI sends no `result` within 4 s after the interrupt acknowledgement, the turn is closed locally so the stop button never hangs.
- Bypass mode: found against the real CLI 2.1.181, switching to `bypassPermissions` works only when the process was launched with `--allow-dangerously-skip-permissions`; `buildArgs` adds that flag when `claudeLocal.allowDangerouslySkipPermissions` is on. A failed `set_permission_mode` / `set_model` shows a Hebrew notice and the UI keeps the previous value.
- Failures add a Hebrew error to the conversation: spawn failure ("לא ניתן להפעיל את Claude (…). בדוק את ההגדרה claudeLocal.claudePath."), unknown option ("גרסת Claude Code לא מכירה אחד הדגלים שהתוסף שלח."), else exit code + the last 3000 characters of stderr.
- Every line in and out is logged at debug level to the OutputChannel, message contents cut to 500 characters.
- Lifetime: killed when its panel or view is disposed or the extension deactivates.
- Not verified: a real model turn (the CLI is not logged in on this machine), so the stream events were exercised only through the fake CLI and the CLI's own transcripts; real CLI behaviour after `interrupt`; the exact `can_use_tool` response fields (`updatedInput`, `updatedPermissions`, deny `message`) against a real permission request.
- Code (as built): `src/cli/` (`args.js`, `spawn.js`, `process.js` with `send`/`request`/`respond`/`respondError`/`interrupt`/`kill`, `content.js`), `dev/fake-claude.js` (+ `.cmd`; scenarios `tool`, `שאלה`, `slow`; `FAKE_CLAUDE_INTERRUPT=no-result|error`; rejects bypass without `--allow-dangerously-skip-permissions` like the real CLI), `test/args.test.js`, `test/process.test.js`.

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
  - Thinking: collapsed by default, expandable.
  - Tool rows: tool name + a one-line summary (file path, command, pattern), expandable to the full input and the result; file paths open the file.
  - Result line when the `result` message arrives: duration, cost and tokens, each only when given.
  - Errors in Hebrew (see "Process & protocol").
  - During a turn a spinner with a Hebrew verb ("חושב…") and the stop button.
- Composer: Enter sends, Shift+Enter is a new line; with `claudeLocal.useCtrlEnterToSend` Ctrl+Enter sends and Enter is a new line. While a turn runs the send button becomes stop. Footer: mode selector, model picker.
- Model picker: the models from the `initialize` response (`displayName`, `description` as hint); a change sends `set_model`. The first choice is the CLI default (no `--model`).
- Known limits: no image paste, attachments, @-mentions, editor context, thinking toggle, focus view, timestamps (later milestones).
- Verified: in a browser preview (`dev/preview-*`, simulated host) in dark and light themes — streaming Markdown, tables, highlighted code, tool rows with an Edit diff, permission approve, the `/` menu, the mode menu, the history panel, loading a past session.
- Not verified: the CSP and `localResourceRoots` in a real VS Code webview; a real model reply; high-contrast theme; Hebrew/English mixed text in the real webview.
- Code (as built): `src/panels/` (`webview-html.js`, `message-router.js`, `event-translator.js`, `conversation.js`), `webview/chat/` (`index.html`, `chat.css`, `highlight-theme.css`, `util.js`, `markdown.js`, `tools.js`, `thread.js`, `cards.js`, `menu.js`, `composer.js`, `app.js`), `webview/vendor/`.

## History (past conversations)
The CLI's transcripts are the only store; the extension reads them read-only (user decisions).
- Source: `~/.claude/projects/<encoded cwd>/*.jsonl` (`CLAUDE_CONFIG_DIR` respected; the cwd is encoded by replacing every non-alphanumeric character with `-`) for the conversation's `cwd`. Per file: id (file name without `.jsonl`), title, last activity (file mtime). Title rule as built: the CLI's own custom title (set by `/rename` or the app) wins, then a `summary` line, then the first real user message (60 characters). Titles can appear late in a file, so the head and the tail (64 KB each) are read. Newest first; no message count (would need a full read).
- UI: a "שיחות קודמות" button in the chat header opens a searchable list grouped "היום", "אתמול", "השבוע", "קודם" (by mtime, local time; "השבוע" was added during the build). Search filters by title. An empty state says "אין שיחות קודמות בתיקייה הזו". There is no separate activity-bar sessions panel in this milestone.
- Opening a past conversation: the earlier messages are read from its jsonl and rendered with the same renderer as live ones (user text, assistant text as Markdown, thinking, tool rows; sidechain, meta and system-injected entries skipped), then the process is started with `--resume <id>` so the next message continues it.
- Where it opens: if the current panel holds no conversation yet (no messages), it is reused; otherwise (messages present, or a turn running) the past conversation opens in a new editor tab. If the same session id is already open in a tab of this window, that tab is focused instead (an in-memory check only).
- Read-only guarantee: the extension never writes, renames, deletes or archives a transcript.
- The cwd encoding rule was checked on this machine ("C:\AI projects\X" becomes "C--AI-projects-X").
- Verified: listing and loading a past session in the browser preview; `test/transcripts.test.js` on fixture files.
- Not verified: resuming a past conversation with `--resume` against the real CLI inside VS Code (needs `claude auth login`).
- Code (as built): `src/history/` (`transcripts.js` with `listSessions` / `readSession` / `sessionTitle`, `transcript-events.js`), `src/cli/content.js`, `webview/chat/history.js`, `test/transcripts.test.js`.

## Skills / commands menu
- Typing `/` at the start of the composer opens a menu listing the CLI's commands from the `initialize` response (`name`, `description`, `argumentHint`), filtered as you type; arrows move, Enter/Tab/click insert `/<name> ` into the composer, Esc closes. The CLI executes it when the message is sent. This includes the user's skills, since the CLI lists them as commands. There is no separate skills button.
- If the `initialize` response has not arrived yet or has no commands, typing `/` shows nothing.
- Not verified: how skills vs. built-in commands are distinguished in the list (no distinction is made in this milestone).
- Code (as built): `webview/chat/slash-menu.js` (shared list behaviour in `webview/chat/menu.js`).

## Permissions & modes
The CLI decides; the extension only relays (user decision).
- Permission card for every `can_use_tool`: the tool name, its input (expandable), and buttons "אישור", "אישור תמיד" (only when the CLI sent `permission_suggestions`; answers allow with those suggestions as the updated permissions), "דחייה" (with an optional reason). Cards stay in the thread until answered; pending cards are denied on stop.
- `ExitPlanMode` (needed for plan mode to be usable) shows the plan as rendered Markdown with "אישור התוכנית" / "המשך תכנון". `AskUserQuestion` has a real option picker (changed during the build from the planned generic card): the chosen answers go back as `updatedInput.answers`, keyed by question text, because a plain "allow" would return no answers.
- Mode selector in the composer footer: "ידני" (`default`), "עריכה אוטומטית" (`acceptEdits`), "תכנון" (`plan`), and "ללא הרשאות" (`bypassPermissions`) only when `claudeLocal.allowDangerouslySkipPermissions` is on. The start mode is `default`. A live change sends `set_permission_mode`; the selector shows the mode the CLI confirms.
- Known limits: no native diff review — file edits are approved from the permission card (the input shows `old_string`/`new_string`/`content`).
- Not verified: the permission flow against a real `can_use_tool` request (fake CLI and browser preview only).
- Code (as built): `webview/chat/cards.js` (permission, plan and question cards), `src/panels/conversation.js` (`onControlRequest`, `answerPermission`, `denyAllPending`), `src/panels/message-router.js`.

## Settings
VS Code settings are user configuration, not conversation data, so they do not conflict with the no-storage rule. Configuration title "Claude Code Local"; descriptions in Hebrew.

| Setting | Type, default | Meaning |
|---|---|---|
| `claudeLocal.claudePath` | string, `claude` | the CLI executable |
| `claudeLocal.allowDangerouslySkipPermissions` | boolean, false | shows "ללא הרשאות" in the mode selector |
| `claudeLocal.useCtrlEnterToSend` | boolean, false | Ctrl+Enter sends, Enter is a new line |

- Changes apply live; `claudePath` applies to the next process start and the chat says "ההגדרה תחול בשיחה הבאה".
- Code (as built): `package.json` `contributes.configuration`, `src/util/settings.js`.

## Out of scope for this milestone
Later milestones, per `plan.md`: native diff review, editor context / @-mentions / Alt+K, IDE MCP tools and the WebSocket server, terminal mode, walkthrough and onboarding, the activity-bar sessions list, archive / groups / rename / unread, reload restore, image paste, thinking toggle, focus view, timestamps, new-window and primary-editor commands, `environmentVariables` / `claudeProcessWrapper` settings. Not copied from the official extension at all: sign-in, plugins UI, Web tab, Remote Control, Claude in Chrome, usage bars, voice, worktrees, URI handler, `/btw`, bookmarks, agent map, LaTeX.

## Build order
1. `package.json` + `extension.js` + `src/util/` (manifest, logger, settings).
2. `src/cli/` + `dev/fake-claude.js` + `test/args.test.js`, `test/process.test.js`.
3. `src/history/transcripts.js` + `test/transcripts.test.js`.
4. `webview/vendor/` (download once, pin the version, keep licenses) + `webview/chat/` shell, thread rendering, composer.
5. `src/panels/` (webview HTML, router, translator, tab, sidebar, status bar, commands).
6. Permission cards and mode selector; `/` menu; model picker; history list and resume.
7. Manual pass in the Extension Development Host against the real CLI; `scripts/package.ps1`.
Each step goes through the enforcing-coding-workflow stages; this spec is updated from "planned" to "as built" per section when it ships.
Status: steps 1-6 built and verified as far as the "Status" line at the top says; step 7 is pending (manual pass needs `claude auth login`; `scripts/package.ps1` not built).

## Testing
- Automated: `node --test "test/*.test.js"` (run in PowerShell; Node 22 needs the glob, a bare folder does not work); 22/22 pass. Tests: `args`, `process`, `event-translator`, `transcripts`, `conversation` (with a stub `vscode` module). `dev/fake-claude.js` (+ `.cmd`) is a fake stream-json CLI that answers `initialize` (commands, models), streams a reply with partial messages, asks `can_use_tool`, and honours `interrupt`; selected with `claudeLocal.claudePath`. Units: args building, process/control protocol over a pipe to the fake CLI, transcript reading, the event translator.
- `node --check` on every `.js` file and a JSON check of `package.json`.
- Manual: Extension Development Host (`code --extensionDevelopmentPath=<repo>`), first against the fake CLI, then the real CLI. Checklist: open a tab, the sidebar and the status-bar item; Ctrl+Shift+Esc; a question streams and renders Markdown, a table, highlighted code with copy; thinking collapses; a tool row expands; a permission card (allow, always, deny); mode and model change; stop; "past conversations" lists this folder's chats, opening one shows its earlier messages and a new message continues it; `/` menu lists the CLI's commands; Hebrew text and mixed English render correctly in RTL; light and dark themes.
- Browser preview (dev-only, no VS Code): `dev/preview-server.js` + `dev/preview-host.js` serve the webview with a simulated host (`.claude/launch.json` "chat-preview"); used to check rendering and layout.
- Not verified: the whole manual checklist above inside VS Code, and anything that needs a real model reply (the CLI is not logged in). Manual checks are reported as not done until they actually run.
