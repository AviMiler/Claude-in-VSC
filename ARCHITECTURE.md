# Architecture

## System Overview
A VS Code extension that is a thin Hebrew RTL front for the real `claude` CLI. It owns no data: live content comes from a CLI process, history is read read-only from the CLI's transcripts.

## Entry Points
`extension.js` `activate` (on startup finished) wires `src/panels/index.js`. Users enter through the `claude-local.*` commands, the editor/title button, the "✻ Claude" status-bar item, or the sidebar views.

## Module Map
`src/cli/` spawns and talks to the CLI; `src/panels/` binds one webview to one CLI process (`conversation.js`); `src/history/` reads transcripts; `src/util/` has logger, settings, paths; `webview/chat/` is the UI (plain scripts) and `webview/vendor/` the pinned libraries.

## Data Flow
The webview posts `ready`; `Conversation` spawns the CLI (`args.js`, `spawn.js`, `process.js`) and sends `initialize`, then forwards commands and models. A `send` goes to the CLI's stdin; stream lines pass through `event-translator.js` and arrive as `events` batches rendered by `thread.js`. `can_use_tool` becomes a `permission` card and the answer returns as `permissionAnswer`. Past chats: `listHistory` / `openSession` read the jsonl via `transcripts.js`, then the process restarts with `--resume`.

## External Integrations
The `claude` CLI (`claudeLocal.claudePath`, stream-json + control protocol over stdio) and its files under `~/.claude` (`CLAUDE_CONFIG_DIR` respected). No network from the webviews. The extension host makes one exception: a read-only `GET /v1/models` to the user's own model gateway (in memory only; see DECISIONS.md, 2026-11-01).

## Key Boundaries & Constraints
Nothing is persisted (no globalState/workspaceState/own files) and transcripts are never written. One conversation = one process; a process dies with its panel. The webview has a strict CSP (nonce scripts, only `webview/` and `resources/`), raw Markdown HTML is escaped, and links open through the host (http/https only). `event-translator.js` and `transcripts.js` must stay free of `vscode` so they can be unit-tested. No build step, no TypeScript.

## Design Decisions
See DECISIONS.md.
