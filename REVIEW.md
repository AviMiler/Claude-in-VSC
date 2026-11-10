# Review 2026-11-10: architecture, the approach to the model, feature ideas

One review of the whole tool, done by reading the code and the documents. **Nothing here is decided, scheduled or built.** Each item is reviewed with the user; an approved item moves to `PLAN.md` (features), `FIXES.md` (bugs) or `DECISIONS.md` (decisions) and is marked here.

**Status values:** 💡 proposed, not discussed · ✅ approved, moved · ❌ rejected.

**How sure each item is:**
- *Read in the code*: verified by reading this repository on 2026-11-10.
- *From memory, unverified*: names of CLI environment variables, flags and protocol messages. They were not checked against CLI 2.1.246 (no CLI was available in the review session). Each needs a short check on the work machine before it is relied on.

Test run in the review session (Linux, Node 22): 291 tests, 285 pass, 1 skipped, 5 fail. The 5 failures are in `mentions`, `tagging` and `editor-context` tests that assume Windows paths (section 2.6); they are documented as passing on Windows.

## 1. The approach to the model

The user's three problems (`FUTURE_FEATURES.md` section 4): a small window (64,000, of which about 31,000 are usable), a slow model, a weak model. Items are ordered by expected gain per effort.

### 1.1 The 33,000 autocompact buffer is probably 20,000 + 13,000 — 💡 (from memory, unverified)
The usage card shows 33,000 of 64,000 tokens reserved (`FUTURE_FEATURES.md` 4.1g, `DEPENDENCIES.md` row 44). The number equals exactly an output reserve of 20,000 plus a compaction margin of 13,000. If that is its origin, the output reserve follows the maximum output tokens.
- **Check:** set `CLAUDE_CODE_MAX_OUTPUT_TOKENS=8000` in `claudeLocal.environmentVariables` and read the usage card. Expected if the hypothesis holds: the buffer drops to about 21,000, giving about 12,000 tokens back to the conversation.
- **Second candidate:** `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (the percentage of the window at which autocompact starts).
- Cost: no code; one setting and one look at the card. Risk: a long answer is cut at the lower output limit.

### 1.2 Side calls to the model may evict the main conversation's cache — 💡 (hypothesis)
The session-title call, each `/btw` question and autocompact are separate requests to the same server. With a single Ollama slot, a request with a different prompt can replace the cached prefix of the main conversation, so the next turn recomputes the whole context. On a slow model that would be most of the waiting time.
- **Check first:** measure the time to the first token per turn (feature 3.3) and compare a turn after a `/btw` or a title call with a turn after none.
- **Candidates if confirmed:** `DISABLE_NON_ESSENTIAL_MODEL_CALLS=1` (from memory, unverified); `OLLAMA_NUM_PARALLEL=2` on the server, so a side call gets its own slot (costs memory: one context per slot).
- Related: `FUTURE_FEATURES.md` 4.2a (keep the model loaded) and 4.2b (stable prefix).

### 1.3 Telemetry off in our spawn — 💡 (answers open question 2 in `AGENT_CONTEXT.md`; from memory, unverified)
Candidates: `DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`, or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, which covers both plus the auto-updater. On a machine without internet these only remove failed export attempts and their log noise.

### 1.4 Caps on tool output — 💡 (same as `FUTURE_FEATURES.md` 4.1c; names from memory, unverified)
`MAX_MCP_OUTPUT_TOKENS` defaults to 25,000, which is almost all of the usable window. Lower it, and `BASH_MAX_OUTPUT_LENGTH`, so one large result cannot fill the context. Our own navigation tools are already capped (`MAX_RESULTS` 50, `MAX_CHARS` 2000 in `src/mcp/nav-tools.js`; read in the code).

### 1.5 Hooks through the control protocol — 💡 (protocol from memory, unverified on 2.1.246)
Today `onControlRequest` (`src/panels/conversation.js:499`) answers every request other than `can_use_tool` with an error (read in the code). The official SDK registers hooks in the `initialize` request and receives `hook_callback` control requests on the same stdio. One probe of this opens three things with no server and no files:
- **Diagnostics after an edit** (`FUTURE_FEATURES.md` 4.3e): a `PostToolUse` hook on `Edit|Write` returns the editor's new diagnostics for that file as additional context.
- **A guard on large reads:** a `PreToolUse` hook on `Read` of a very large file answers with a pointer to `documentSymbols` / `readSymbol` instead.
- **Context at send time:** a `UserPromptSubmit` hook adds context without changing the user's text.
- **Fallback if the probe fails:** a hook inside the `--settings` JSON the extension already passes (`src/models/launch.js`). That needs a command the hook can run; `process.execPath` with `ELECTRON_RUN_AS_NODE=1` is a candidate because Node is not on the PATH. Unverified.
- The same probe should check SDK MCP servers over stdio (`mcp_message`); if they work, the HTTP navigation server and its token are not needed (section 2.2).

### 1.6 Steer the weak model to the navigation tools — 💡
The tool descriptions in `src/mcp/nav-tools.js` are one short sentence each (read in the code). A weak model picks `Grep` and `Read` by habit. Two or three English lines through `--append-system-prompt` ("before reading a whole file, call documentSymbols, then readSymbol") cost far fewer tokens and less risk than replacing the whole system prompt (4.1b). Check: the flag works together with `-p --input-format stream-json` on 2.1.246; measure navigation tool use before and after in the log (`tools/call` lines).

### 1.7 Context window per model — 💡 (the open bug, `PLAN.md` section 6 item 2)
`launchSettings` passes one `CLAUDE_CODE_MAX_CONTEXT_TOKENS` for every model (read in the code), so `qwen2.5-coder:7b` ran with 64,000 against a real window of 32,768. The extension already fetches `/v1/model/info`; if it carries the window per model, pass that value for the picked model, with the setting as the fallback.

### 1.8 Fewer tools — 💡 (same as `FUTURE_FEATURES.md` 4.1a)
No new finding; the usage card's "system tools" row (commit 5213221) now gives the before/after measurement that 4.1a asks for.

### 1.9 Sampling settings at the gateway — 💡
A low temperature for the coding model helps `Edit`'s exact `old_string` match. This belongs in the LiteLLM/Ollama configuration, not in the extension (the extension never talks to the model); a line in `SETUP.md` is enough.

## 2. Architecture and code

### 2.1 `conversation.js` does too much — 💡 (read in the code)
799 lines. The `message` listener in `startProcess` feeds eight trackers by hand (checkpoints, loop, background tasks, Claude's tasks, the translator, plan, autosave, edit log, agent cards), and some helpers reach into the conversation's fields directly (`fileChip.applyToSend(this, …)`, `loopHost.trackLoop(this, …)`, `refreshContextMeter(conversation)`). The pure modules already exist; what is missing is one interface (for example `apply(msg)` returning the messages to post) and one list the listener walks. Do this before adding more trackers (1.5, 3.1, 3.3 would each add one).

### 2.2 `CliProcess` starts the navigation server itself — 💡 (read in the code)
`src/cli/process.js:55` starts one HTTP server per conversation, and the process class requires `src/mcp/`. Better: one server for the extension, started once and injected; the process receives only extra arguments. Also, the Bearer token travels inside `--mcp-config` in the process arguments, so it is visible in the machine's process list. Low risk on a single-user machine; removed entirely if 1.5's stdio MCP works.

### 2.3 Bug: the sent-context memory survives compaction — 💡 candidate for `FIXES.md` (read in the code)
`lastContextSent` is reset only when the user types `/clear` (`src/tagging/file-chip.js:119`). After autocompact, `/compact` or a fork the model no longer has the opened-file or selection block, and the extension does not send it again until the file or selection changes. Fix direction: reset on the compaction boundary line of the stream and on `/compact`.

### 2.4 No size limit on the replay log — 💡 (read in the code)
`src/panels/replay-log.js` keeps every tool result in full for every open conversation, and `restore` posts everything in one message. No cap was found there or in `event-translator.js`. Trim long tool results in the log (the thread shows them collapsed anyway).

### 2.5 The contract with the CLI rests on a hand-written fake — 💡
`dev/fake-claude.js` is written by hand and most behavior is marked unverified in real use. A recorded real stream from the work machine (types and shapes, text replaced) as a test fixture would catch protocol changes between CLI versions. The no-files rule holds if the recording is copied from the log by the user, as today.

### 2.6 Platform-dependent paths in pure functions — 💡 (read in the test run)
Five tests fail on Linux because `mentions`, `tagging` and `editor-context` take the path rules from the running platform. Injecting `path.win32` (or the separator) into the pure functions makes the tests pass everywhere and makes the Windows behavior explicit.

### 2.7 Documents — 💡 (minor)
Test counts appear with different values in several places (269, 286, 287, 302 in `AGENT_CONTEXT.md` and `PROJECT_MAP.md`). Keeping the count in one place only would follow the project's own "facts live in one place" rule.

## 3. Features that are not yet in `FUTURE_FEATURES.md`

### 3.1 Stuck detector — 💡
The same tool with the same input three times in a row, or three failed `Edit` calls in a row, shows a card "the model is stuck" with a stop button. With a slow model each such round costs minutes. Needs nothing from outside; the data is already in the stream events.

### 3.2 "Check" button — 💡
A per-project check command (tests or lint) that runs and sends the model only the failures, trimmed. Open: where the command is configured (a setting), and whether running it needs approval each time.

### 3.3 Speed in the result line — 💡
Tokens per second and time to the first token, per model. Used to compare models and to see cache eviction (1.2). The timestamps are already available from the stream lines.

### 3.4 More chips — 💡
"Problems in this file" (the editor's diagnostics), "current git diff", a selection from the terminal. Each uses the existing `withContext` channel.

### 3.5 Recipes as files under `.claude/commands/` — 💡 (a cheaper form of `FUTURE_FEATURES.md` 4.3a)
Short step-by-step procedures (`/fix-bug`, `/add-test`) as the CLI's own command files instead of extension code. No work in the extension, and they also work in the official extension (answers open question 1 in `AGENT_CONTEXT.md`). Open: these are files in the project, written by the user, not by the extension.

## 4. Recommended order (proposed, not approved)

1. Environment variables, no code: 1.1, 1.2 (measure), 1.3, 1.4. Read the result in the usage card.
2. The `hook_callback` probe (1.5), then diagnostics after an edit.
3. Stuck detector (3.1) and the speed line (3.3).
4. "New task, new conversation" with a summary (`FUTURE_FEATURES.md` 4.1e); it matters more the smaller the window is.
5. Split `conversation.js` (2.1) before more trackers are added.

Small and independent, any time: 1.7 (the open window bug), 2.3 (the context reset bug), 1.6.
