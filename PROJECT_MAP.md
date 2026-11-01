# Project map

One line per file. (No `graphify-out/graph.json` here, so this map is hand-maintained; update it when files are added, removed or renamed.)

## Root
- `extension.js` — entry: builds logger, settings, registry; sets the secondary-sidebar context key; calls `panels.register`.
- `package.json` — manifest: 5 commands, Ctrl+Shift+Esc and Ctrl+Alt+C, editor/title button, 2 view containers + 2 views, 3 settings.
- `.vscodeignore` — keeps dev/, test/, .claude/ out of the package.
- `AGENT_CONTEXT.md` — entry point for an agent: what to read, current state, working agreements, git rules.
- `spec.md` — what the extension does today (as built) and its verification status.
- `DECISIONS.md` — architecture-level decisions with alternatives and reasons.
- `ARCHITECTURE.md`, `DEPENDENCIES.md` — structure and boundaries; the vendored libraries.
- `CHANGELOG.md` — what changed and why, newest first.
- `SETUP.md` — install and settings for the user's machine (Hebrew).

## src/cli/ — the CLI process
- `args.js` — builds the stream-json argument list (`--resume`, `--model`, bypass flag).
- `spawn.js` — resolves the executable on PATH x PATHEXT; `.cmd`/`.bat` via `cmd.exe /d /s /c`.
- `process.js` — `CliProcess`: NDJSON over stdio, control protocol, interrupt, kill fallback.
- `content.js` — helpers for message content blocks (shared by live stream and transcripts).

## src/panels/ — host side of the chat
- `conversation.js` — one webview + one CLI process: permissions, history, mode/model, stop.
- `message-router.js` — webview message `type` to `Conversation` method.
- `event-translator.js` — CLI stream lines to UI events (pure).
- `webview-html.js` — builds the webview HTML with CSP, nonce and resource URIs.
- `panel-registry.js` — in-memory list of open conversations.
- `chat-panel.js` — editor-tab conversation (`claudeLocalPanel`).
- `sidebar-view.js` — sidebar/activity-bar conversation.
- `commands.js` — `claude-local.*` commands.
- `status-bar.js` — the "✻ Claude" item.
- `index.js` — `register` for the panels feature.

## src/history/ — read-only transcripts
- `transcripts.js` — `listSessions`, `readSession`, `sessionTitle` for `~/.claude/projects/...`.
- `transcript-events.js` — transcript entries to the same UI events as live.

## src/util/
- `logger.js` (OutputChannel), `settings.js` (`claudeLocal.*` + change events), `paths.js` (CLI dirs, `encodeCwd`), `nonce.js`, `vscode-version.js` (secondary sidebar >= 1.106).

## webview/chat/ — plain scripts loaded by `index.html`
- `index.html` shell; `chat.css`, `highlight-theme.css`; `util.js`; `markdown.js` (marked wrapper, escapes raw HTML); `tools.js` (tool rows); `thread.js` (messages, streaming); `cards.js` (permission/plan/question cards); `menu.js` (shared list menu); `slash-menu.js` (`/` commands); `composer.js`; `history.js` (past conversations list); `app.js` (wiring, messages from host).

## webview/vendor/
- `marked.umd.js`, `marked.LICENSE.md`, `highlight.min.js`, `powershell.min.js`, `highlight.LICENSE` — see DEPENDENCIES.md.

## resources/
- `claude-logo.svg` — hand-drawn spark used for commands and containers.

## docs/ — roadmap, findings, references (Hebrew)
- `final-plan.md` — the roadmap: every feature decision with its reason, the settings table, build order (packages A-G), open points, IDE-server design notes.
- `conclusions.md` — findings about the CLI, the gateway and VS Code with their evidence, and what is still unknown.
- `litellm-gateway.md` — the LiteLLM gateway and Ollama: endpoints, per-model config, measured context window.
- `claude-code-vscode-guide-he.html` — Hebrew guide to the official extension's features (reference for the roadmap).

## dev/ — development only (not packaged)
- `README.md` — how to run the probes, the gateway probe, the fake CLI and the browser preview.
- `fake-claude.js` / `.cmd` — fake stream-json CLI (scenarios `tool`, `שאלה`, `slow`).
- `preview-server.js`, `preview-host.js`, `preview-theme.css` — browser preview with a simulated host.
- `probe-cli.js` — first CLI feasibility probe (needs the repo); `probe-standalone.js`, `probe2-standalone.js`, `probe3-standalone.js` — self-contained probes against the real CLI (checks `p1`-`p8`, `q1`-`q10`, `s1`-`s5`).
- `gateway-probe/` — dev-only VS Code extension (`package.json`, `extension.js`, `probe.js`) that checks the extension host can reach the model gateway.

## test/
- `args.test.js`, `process.test.js`, `event-translator.test.js`, `transcripts.test.js`, `conversation.test.js` (stub `vscode`).

## .claude/
- `launch.json` — "chat-preview" server config.
