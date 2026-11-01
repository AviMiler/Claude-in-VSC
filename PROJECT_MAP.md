# Project map

One line per file. (No `graphify-out/graph.json` here, so this map is hand-maintained; update it when files are added, removed or renamed.)

## Root
- `extension.js` — entry: builds logger, settings, registry; sets the secondary-sidebar context key; calls `panels.register`.
- `package.json` — manifest: 9 commands, keybindings (Ctrl+Shift+Esc, Ctrl+Alt+C, Ctrl+Esc, Alt+K, opt-in Ctrl+N), editor/title button, 2 view containers + 2 views, 12 settings.
- `package.json` — manifest: 8 commands, keybindings (Ctrl+Shift+Esc, Ctrl+Alt+C, Ctrl+Esc, Alt+K, opt-in Ctrl+N), editor/title button, 3 view containers (chat sidebar, fallback, sessions list) + 3 views, 12 settings.
- `.vscodeignore` — keeps dev/, test/, .claude/ out of the package.
- `AGENT_CONTEXT.md` — entry point for an agent: what to read, current state, working agreements, git rules.
- `spec.md` — what the extension does today (as built) and its verification status.
- `DECISIONS.md` — architecture-level decisions with alternatives and reasons.
- `ARCHITECTURE.md` — structure and boundaries.
- `DEPENDENCIES.md` — vendored libraries and the measured findings about the CLI, the gateway/Ollama and VS Code (with evidence and what is unknown).
- `PLAN.md` — the roadmap: every feature decision with its reason, the settings table, build order (packages A-G), open points, IDE-server design notes.
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
- `conversation.js` — one webview + one CLI process: permissions, history, mode/model, stop.
- `message-router.js` — webview message `type` to `Conversation` method.
- `mentions.js` — file/folder listing (`git ls-files` or walk) and ranking for `@` completion (pure apart from `git`).
- `plan-doc.js` — read-only virtual Markdown document for the plan (`claude-local-plan:` scheme).
- `event-translator.js` — CLI stream lines to UI events (pure).
- `webview-html.js` — builds the webview HTML with CSP, nonce and resource URIs.
- `panel-registry.js` — in-memory list of open conversations, closed list (max 10), open states, change listener.
- `session-model.js` — pure: classify/filter sessions, continue-last suggestion, tab tracker, title marker, closed-list push.
- `history-tree.js` — Activity Bar TreeView `claudeLocalHistory` and its commands (filter, rename, reopen closed, continue last).
- `chat-panel.js` — editor-tab conversation (`claudeLocalPanel`).
- `sidebar-view.js` — sidebar/activity-bar conversation.
- `commands.js` — `claude-local.*` commands (main button follows `preferredLocation` / `useTerminal`; `focusToggle`, `keyboardShortcuts`, `terminal.open`).
- `status-bar.js` — the "✻ Claude" item.
- `index.js` — `register` for the panels feature.

## src/history/ — read-only transcripts
- `transcripts.js` — `listSessions`, `readSession`, `sessionTitle` for `~/.claude/projects/...`.
- `transcript-events.js` — transcript entries to the same UI events as live.

## src/util/
- `workspace.js` (`workspaceCwd`: first folder or home), `logger.js` (OutputChannel), `settings.js` (`claudeLocal.*` + change events), `paths.js` (CLI dirs, `encodeCwd`), `nonce.js`, `vscode-version.js` (secondary sidebar >= 1.106).

## webview/chat/ — plain scripts loaded by `index.html`
- `index.html` shell; `chat.css`, `highlight-theme.css`; `util.js`; `markdown.js` (marked wrapper, escapes raw HTML); `tools.js` (tool rows); `thread.js` (messages, streaming); `cards.js` (permission/plan/question cards); `menu.js` (shared list menu); `slash-menu.js` (grouped `/` commands); `prompt-logic.js` (pure: command grouping, queue, history, image check); `mention-menu.js` (`@` files/folders); `keys.js` (parses and matches the `keybindings.*` specs); `composer.js`; `history.js` (past conversations list); `app.js` (wiring, messages from host).

## webview/vendor/
- `marked.umd.js`, `marked.LICENSE.md`, `highlight.min.js`, `powershell.min.js`, `highlight.LICENSE` — see DEPENDENCIES.md.

## resources/
- `claude-logo.svg` — hand-drawn spark used for commands and containers.

## dev/ — development only (not packaged)
- `README.md` — how to run the probes, the gateway probe, the fake CLI and the browser preview.
- `claude-code-vscode-guide-he.html` — Hebrew guide to the official extension's features (reference for `PLAN.md`).
- `fake-claude.js` / `.cmd` — fake stream-json CLI (scenarios `tool`, `שאלה`, `slow`).
- `preview-server.js`, `preview-host.js`, `preview-theme.css` — browser preview with a simulated host.
- `probe-cli.js` — first CLI feasibility probe (needs the repo); `probe-standalone.js`, `probe2-standalone.js`, `probe3-standalone.js` — self-contained probes against the real CLI (checks `p1`-`p8`, `q1`-`q10`, `s1`-`s5`).
- `gateway-probe/` — dev-only VS Code extension (`package.json`, `extension.js`, `probe.js`) that checks the extension host can reach the model gateway.

## test/
- `args.test.js`, `process.test.js`, `env.test.js`, `keys.test.js`, `event-translator.test.js`, `transcripts.test.js`, `conversation.test.js` (stub `vscode`), `prompt-logic.test.js`, `mentions.test.js`, `session-model.test.js`, `panel-registry.test.js`.

## .claude/
- `launch.json` — "chat-preview" server config.
