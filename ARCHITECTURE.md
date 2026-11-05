# Architecture

## System Overview
A VS Code extension that is a thin Hebrew RTL front for the real `claude` CLI. It owns no data: live content comes from a CLI process, history is read read-only from the CLI's transcripts.

## Entry Points
`extension.js` `activate` (on startup finished) wires `src/panels/index.js`. Users enter through the single command `claude-local.open` (editor/title button, the "✻ Claude" status-bar item, Ctrl+Alt+C, the URI), which `places.main()` routes to the one configured place: the sidebar view (default) or one editor tab.

## Module Map
`src/cli/` spawns and talks to the CLI; `src/panels/` is layered `places.js` -> `ConversationHost` (`conversation-host.js`, several conversations per place, one attached to the webview) -> `Conversation` (`conversation.js`, one CLI process, plus its `replay-log.js`) -> webview; `src/history/` reads transcripts; `src/util/` has logger, settings, paths; `webview/chat/` is the UI (plain scripts) and `webview/vendor/` the pinned libraries.

## Data Flow
The webview posts `ready`; `Conversation` spawns the CLI (`args.js`, `spawn.js`, `process.js`) and sends `initialize`, then forwards commands and models. A `send` goes to the CLI's stdin; stream lines pass through `event-translator.js` and arrive as `events` batches rendered by `thread.js`. `can_use_tool` becomes a `permission` card and the answer returns as `permissionAnswer`. Only the attached `Conversation` paints to the webview; a hidden one keeps running and records into its replay log, and a switch redraws the webview in one pass from the log (`restore`). The drawer's `listConversations` / `openSession` are handled by the host: past chats are read from the jsonl via `transcripts.js`, then a process starts with `--resume`.

## External Integrations
The `claude` CLI (`claudeLocal.claudePath`, stream-json + control protocol over stdio) and its files under `~/.claude` (`CLAUDE_CONFIG_DIR` respected). No network from the webviews. The extension host makes one exception: a read-only `GET /v1/models` to the user's own model gateway (in memory only; see DECISIONS.md, 2026-11-01).

## Key Boundaries & Constraints
Nothing is persisted (no globalState/workspaceState/own files) and transcripts are never written. The message queue and prompt history live in the webview and are saved per conversation in memory on a switch (the host sends a hidden conversation's queue); the plan opens as a read-only virtual document (`plan-doc.js`), no file is written. One conversation = one process; it dies when the conversation is closed or the extension deactivates, not when the view or tab showing it is disposed (the host outlives the webview). Conversations are never shown in two places at once. The webview has a strict CSP (nonce scripts, only `webview/` and `resources/`), raw Markdown HTML is escaped, and links open through the host (http/https only). `event-translator.js` and `transcripts.js` must stay free of `vscode` so they can be unit-tested. No build step, no TypeScript.

## Design Decisions
See DECISIONS.md.
