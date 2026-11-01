# Dependencies

Everything the extension depends on: its vendored libraries, the Claude Code CLI, the model gateway (LiteLLM) with Ollama, and VS Code. Sections 2-5 are findings measured on the user's machine (as of 2026-11-01), each with its evidence, plus what is still unknown. The decisions drawn from them are in `PLAN.md` and `DECISIONS.md`; the install steps for this machine are in `SETUP.md`; how to re-run the probes is in `dev/README.md`.

**Evidence sources:** `probe-report` (first script), `probe2-report`, `probe3-report` (three runs against the real CLI), `gateway-probe` (a check from inside VS Code), and the output of manual commands the user sent.

## 1. Vendored libraries

No npm packages, no `package-lock`, no build step. Third-party code is vendored as plain JS files in `webview/vendor/`, downloaded once from cdn.jsdelivr.net and never fetched at runtime.

| Library | Version | Files | License | Used for |
|---|---|---|---|---|
| marked | 12.0.2 | `marked.umd.js`, `marked.LICENSE.md` | MIT | Markdown to HTML in `webview/chat/markdown.js` (raw HTML is escaped there; marked does not sanitize) |
| highlight.js | 11.9.0 | `highlight.min.js`, `highlight.LICENSE` | BSD-3-Clause | code coloring (common-languages bundle) |
| highlight.js PowerShell grammar | 11.9.0 | `powershell.min.js` | BSD-3-Clause | PowerShell blocks (not in the common bundle) |

- To upgrade: replace the files, keep the license files, update this table and run the browser preview.
- The extension host uses only Node built-ins and the `vscode` API.

## 2. Claude Code CLI (version 2.1.246)

| # | Finding | Reason / evidence | Meaning for the extension |
|---|---|---|---|
| 1 | Run **`claude-bin.exe`, not `claude.cmd`** | The wrapper fetches `/v1/models`, asks "Select model number", then runs `claude-bin.exe --model <choice> %*` and sets environment variables (we read the file). The print-out and the question appeared on every `claude` run in the terminal | The extension would hang on the question if it launched the wrapper |
| 2 | The wrapper also sets `API_TIMEOUT_MS=1200000` and `CLAUDE_ENABLE_STREAM_WATCHDOG=0` | Contents of `claude.cmd` | The extension must pass them itself |
| 3 | `initialize` returns only **4 model aliases** (all `qwen3.8:27b`), with generic capability flags | `p1_initialize` | A model picker or capability filter cannot be built from `initialize` |
| 4 | Skills can be told apart from built-in commands | `system/init` has `skills` (19) against `slash_commands` (46) and `terminal_slash_commands` (`doctor`, `color`) | A grouped `/` menu is possible |
| 5 | `/status`, `/theme`, `/hooks`, `/memory` are not available in stream-json ("isn't available in this environment") and are not in the command list. `/plan`, `/rewind`, `/resume`, `/btw`, `/diff` are not in the list either | `p5_slash_commands` and the `commands` list | The list from `initialize` is exactly what is supported; the extension implements the rest itself |
| 6 | `/rename` writes `custom-title` and `agent-name` to the history file | Searching the `probe-rename-marker` marker in the jsonl | Renaming through the CLI is possible without the extension writing files |
| 7 | `/context`, `/config` (in `key=value` form), `/compact`, `/usage`, `/recap`, `/effort` work | `p5` | A context meter and `/compact` are possible |
| 8 | A message sent mid-turn **is queued and handled after the first one** | `p4`: two results (a count, then `SECOND`); `capabilities` in init: `interrupt_receipt_v1`, `interrupt_cancel_queued_v1`, `msg_lifecycle_v1` | A message queue is possible, including cancelling a queued message |
| 9 | Stop (`interrupt`) returns `{still_queued: []}` and a result `error_during_execution` / `terminal_reason: aborted_streaming` **within about half a second**; the process stays alive and keeps answering | `q9` | The 4-second wait stays only as a fallback; show "■ הופסק", not an error |
| 10 | `--resume` keeps the context and the session id; `--resume --fork-session` creates a new id with the same context | `q9` (the word "pineapple" survived both) | "Previous conversations", fork and a model switch with continuation are possible |
| 11 | Background events: `system/task_started`, `system/background_tasks_changed` (`task_id`, `description`, `task_type`); the request `stop_task` exists | `p7`, `p2` | A task map with stop is possible |
| 12 | `/loop` is a skill that uses `CronCreate` ("Session-only, dies when Claude exits"); the next turn runs **by itself** without a user message, with `command_lifecycle`, `system/init` and `result` | `q8` | The `/loop` indicator is built on `CronCreate`/`CronDelete`; the UI must handle turns that start by themselves |
| 13 | **No `TodoWrite`;** there are `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` | `tools` in `init` and `p7` | Claude's task list is built on these tools |
| 14 | **`!` is not a CLI mode;** the model interprets it and runs Bash | `q10`: the text "I'll run the command per the ! shorthand", a Bash call without permission | Decided to drop it |
| 15 | MCP: `mcp_status` (pending, then after about 15 seconds connected with a tool list), `mcp_reconnect`, `mcp_toggle` (disabled/connected) work. `claude mcp add/remove/list` work (scope local, writes `~/.claude.json`, `-s user\|project` available) | `q7` and terminal output | A full MCP management dialog is possible |
| 16 | `get_context_usage` works and returns categories, `totalTokens`, `maxTokens` | `p2` | A context meter (provided the window value is right) |
| 17 | The `can_use_tool` permission request has `display_name`, `description`, `decision_reason`, `decision_reason_type`, `tool_use_id`; edits and Write also carry `permission_suggestions` (`[{"type":"setMode","mode":"acceptEdits","destination":"session"}]`) and `classifier_approvable`; Read has no suggestions | `probe2`/`probe3` | "Always allow" on edits = switch to `acceptEdits` mode for the session |
| 18 | Our denial message reaches the model word for word | `s3`: the model quoted `probe-denied-reason: ...` | A "deny" button with a reason works |
| 19 | Read-only commands (`echo`, `node --version`) do not ask for permission | `s3`, `q3` | The shape of a Bash request that does need permission was not seen yet (not blocking) |
| 20 | `AskUserQuestion`: `questions[{question, header, options[{label, description}], multiSelect}]`; an answer through `updatedInput.answers` (keyed by the question text) works | `q3` (the model reported "Red") | The existing question card is correct |
| 21 | `ExitPlanMode` arrives with an **empty** `input`, and the plan arrives as plain assistant text in the chat; the approval buttons do not appear | `s3`, and the user's report | The "open in editor" button takes the text from the assistant messages; the card is checked last |
| 22 | **The CLI honours a changed edit (`updatedInput`)** | `s2`: `PROBE_CHANGED` went into the file while the model "thought" it wrote `TWO` | Approving or rejecting each change block separately is possible |
| 23 | **File rewind works** only when the process is started with `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` and `--replay-user-messages`; the saved setting `checkpoints=true` is not enough | `s1a`: `rewindProven: true` (an edit was made and restored, a dry run returned `filesChanged`); `s1b` without the variable: `File rewinding is not enabled` | Full checkpoints are possible; the extension starts the process with the variable and the flag |
| 24 | Permission modes `acceptEdits`, `plan`, `default`, `auto`, `dontAsk` are accepted at run time; `bypassPermissions` is rejected without a start-up flag | `q4` | Auto mode is possible |
| 25 | **In Auto mode a file was created without a question** (while in normal mode Write asks) | `s5` | Auto works; the warning is needed because the classifier runs on a local model and was not tested on dangerous actions |
| 26 | `set_model` at run time **is always accepted without validation;** the error arrives in the next turn as a `result` with `is_error: true` and `subtype: "success"` ("API Error: 400 ...") | `s4` | `is_error` must be checked; this is why a restart was chosen |
| 27 | `--model <id>` at start-up works (`gemma4:26b`); the cold load took 48 seconds; the CLI prints `unrecognized_model` (a warning) | The manual command | Choosing at start-up is the verified way |
| 28 | The session title is created by a call to the **HAIKU model** (`query_source: generate_session_title`) | stderr of a start with `--model gemma4:26b` | When switching model, also set all three `ANTHROPIC_DEFAULT_*_MODEL`, otherwise the server loads two models |
| 29 | A model without tool support (`gemma3:27b`) fails: `does not support tools`; a non-existing name fails: `Invalid model name` | `s4` | Model filtering and a Hebrew message with a return to the previous model |
| 30 | **No thinking** (no `thinking` blocks, 0 thinking tokens) and **effort has no effect** (identical times; the gateway fixes `effort: high`) | `q6` and the gateway settings | The Thinking toggle and the Effort row were dropped |
| 31 | **Vision works** on `qwen3.8:27b` (`left=red right=blue`) | `q5` | Pasting images approved (verified on one model only) |
| 32 | **The cost the CLI reports is meaningless** (0.13$ for a one-word conversation; `costBasis: unknown`); a simple message uses about 24,700 input tokens, and time to first token is about 15 seconds | `p3` | Show tokens only (my adjustment, awaiting approval) |
| 33 | The CLI does not know `qwen3.8:27b` and assumes a 200,000-token window (1 million with the `[1m]` suffix) | The CLI message and `/context` | `CLAUDE_CODE_MAX_CONTEXT_TOKENS` must be set |
| 34 | IDE server: `/ide` reports "No available IDEs detected", the folder `~/.claude/ide` does not exist; the CLI has `--ide` and `autoConnectIde` | Terminal output | **Not verified:** needs a prototype; if it does not work, the chips fallback |

## 3. Model gateway (LiteLLM) and Ollama

Everything here was checked in practice (from VS Code 1.91.1, from the terminal, or with direct requests) unless marked "not verified". Tool: `dev/gateway-probe/` (see `dev/README.md`). How the extension uses the gateway: `PLAN.md` section 3, decisions 1, 5 and 6.

### 3.1 What it is and how to connect

| Topic | Value |
|---|---|
| The gateway | **LiteLLM API 1.80.0** (OAS 3.1, `/openapi.json`), serves the Ollama models in OpenAI format: `http://172.27.5.5:11436`. The CLI talks to it through `ANTHROPIC_BASE_URL` |
| Ollama | `http://172.27.5.5:11435` (the gateway reaches it as `api_base: http://localhost:11435/v1`). **Directly reachable** from the user's machine; port 11434 is closed |
| Key | `ANTHROPIC_AUTH_TOKEN` is `ollama`, sent as `Authorization: Bearer ollama`. Some endpoints are public and need no key |
| The `claude.cmd` wrapper | Fetches the model list (`/v1/models`) from the gateway before every run. The extension launches `claude-bin.exe` directly (`SETUP.md` section 4) |
| The server is shared | `/api/ps` showed `gemma4:26b` loaded while `qwen3.8:27b` was being tested. Checks that load models affect every user |
| Administration | `/ui` in a browser: the LiteLLM admin panel (models and keys are configured by the server administrator) |

### 3.2 Gateway endpoints: the actual results

Checked from the VS Code 1.91.1 Extension Host (Node 20.9.0, Electron 29.4.0, no proxy, `http.proxySupport: override`), with both Node `http` and `fetch`, in 15 to 250 milliseconds. **The extension can reach the gateway.** Without a key `/v1/models` works.

| Endpoint | Method | Result | Meaning |
|---|---|---|---|
| `/v1/models`, `/models` | GET | 200, **ten model ids**. Works with or without a key | Source of the picker list (decided) |
| `/v1/model/info`, `/model/info` | GET | 200 (29 KB). `model_info.*` fields are empty (`null`); `litellm_params` holds each model's settings (section 3.3) | Source for marking JSON-title-only models |
| `/model_group/info` | GET | 200. `supports_vision`, `supports_function_calling`, `supports_reasoning` are `false` for every model, even `qwen3.8:27b`, which sees images and runs tools | **Not reliable** |
| `/public/model_hub` | GET | 200, empty | Not used |
| `/utils/supported_openai_params?model=` | GET | 400 `Could not map model=qwen3.8:27b` (LiteLLM does not know the model) | Not used |
| `/utils/token_counter` | POST | 200: `total_tokens: 9` for `hello world`, `tokenizer_type: openai_tokenizer` | **Approximate count only**; the CLI's `get_context_usage` stays the source for the context meter |
| `/routes` | GET | 200, 422 routes: including `/v1/messages` and `/v1/messages/count_tokens` (the Anthropic routes the CLI uses), `/health`, `/anthropic/{endpoint}` | |
| `/v1/chat/completions` | POST | Used to measure the window (section 3.6); `usage.prompt_tokens` in the answer | |
| `/models/{model_id}`, `/v1/models/{model_id}` | GET | Not verified | |
| `/public/model_hub/info` | GET | Not verified | |

Meaning of error codes: `401` = the endpoint needs a key other than `ollama`; `404`/`405` = not available on this gateway. Gateway errors seen: `gemma3:27b` is rejected with `litellm.BadRequestError: ... does not support tools`, and a non-existing name with `Invalid model name passed`. Ollama's `/api/show` is **not exposed through the gateway** (404). Endpoints unrelated to chat (LiteLLM's MCP gateway, and the `assistants`, `embeddings`, `audio`, `images`, `batches` groups and others): not used; the CLI manages its own MCP.

### 3.3 Per-model settings in the gateway (`litellm_params`)

Every model points at `api_base: http://localhost:11435/v1`, with `extra_body.num_ctx`:

| Model | `num_ctx` | `max_input_tokens` | `max_tokens` (output) | Notes |
|---|---|---|---|---|
| qwen3.8:27b | 12288 | 8192 | 4096 | `stop_sequences: ["</block>"]`, `output_config.effort: high`. A window of at least 50,012 was measured in practice (section 3.6) |
| qwen3:latest | 12288 | 8192 | 4096 | |
| gemma4:26b | 12288 | 8192 | 4096 | `effort: high`. `/api/ps` showed `context_length: 64000` (section 3.5) |
| gemma3:27b | 12288 | 8192 | 4096 | **No tool support** (verified): `does not support tools` |
| gemma4:31b | 12288 | 8192 | 4096 | **Forced JSON output** `{"title": string}` |
| qwen2.5-coder:7b | 16384 | 12288 | 4096 | **Forced JSON output** `{"title": string}` |
| qwen2.5:7b | 16384 | 12288 | 4096 | |
| gpt-oss:20b | 16384 | 12288 | 4096 | |
| llama3.1:70b | 8192 | 4096 | 4096 | timeout 900 |
| gpt-oss:120b | 6144 | 4096 | 2048 | timeout 1200 |

**`num_ctx` and `max_input_tokens` are not enforced:** measured only for `qwen3.8:27b` (plateau test, section 3.6) and `gemma4:26b` (`/api/ps`); the other models were not measured.

### 3.4 What is reliable and what is not

1. **Model capabilities in the gateway are not reliable.** `/model_group/info` says `false` for all; `litellm_params.model_info` says `supports_function_calling: true` for all (even `gemma3:27b`, which fails). Model filtering is therefore done by a list (`claudeLocal.modelDenylist`, default `gemma3:27b`) and by detecting the "does not support tools" error.
2. **Two models are configured for JSON-title-only output** (`qwen2.5-coder:7b`, `gemma4:31b`; `extra_body.output_config.format` with a `{title}` schema), probably for generating titles. They do not suit conversation and are hidden automatically from the picker by the presence of that field.
3. **`effort: high` is fixed** in the gateway configuration, so choosing Effort in the extension has no effect (matches the test that showed no difference). The Effort row is out of the plan.
4. **The model list** (`/v1/models`) is the only source of model names: the CLI's `initialize` returns only four aliases of the same model.
5. **Token counting** (`/utils/token_counter`, `/v1/messages/count_tokens`) exists but is approximate (`openai_tokenizer`), so `get_context_usage` stays the main source.

### 3.5 Ollama directly on port 11435

`GET http://172.27.5.5:11435/api/ps` succeeded, so Ollama's native API is available (unlike the gateway). Example result (the model loaded at that moment, `gemma4:26b`):

| Field | Value | Meaning |
|---|---|---|
| `context_length` | **64000** | The window the model is really loaded with. Different from `num_ctx` in the gateway (12288), so the gateway setting is **not enforced**; the window is set at server level (probably `OLLAMA_CONTEXT_LENGTH`) |
| `size` = `size_vram` | 17,785,065,307 bytes | Loaded entirely onto the GPU |
| `details` | `gguf`, `gemma4`, `25.8B`, `Q4_K_M` | Format, family, size, quantization |
| `expires_at` | about 5 minutes ahead | Keep-alive: the model is unloaded after inactivity |

- `POST :11435/api/show` (for any model) should return `capabilities` (`completion`, `vision`, `tools`, `thinking`), `parameters` and `model_info` (including `<architecture>.context_length`). This is a potentially reliable source for filtering models instead of the gateway data. **Not verified.**
- Port 11435 is probably exposed because of the current network setup; the gateway is the CLI's official path, so the extension fetches the list from it.

### 3.6 Measuring the context window through the gateway: `qwen3.8:27b`

Plateau test (`/v1/chat/completions`, a prompt of N words; the method is in `dev/README.md`):

| Words | `prompt_tokens` | Time |
|---|---|---|
| 2,000 | 2,012 | **285 seconds** (cold model load) |
| 6,000 | 6,012 | 2 seconds |
| 12,000 | 12,012 | 3 seconds |
| 25,000 | 25,012 | 7 seconds |
| 50,000 | 50,012 | 16 seconds |

1. **No plateau:** `prompt_tokens` grows linearly to 50,000, so the effective window is **at least 50,000 tokens** (consistent with `context_length: 64000` from `/api/ps`). Claude Code sends about 25,000 tokens for a simple message (about 24,700 input were measured) and fits comfortably; the instructions are not cut.
2. **Value:** `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`. The CLI does not know the model and assumes 200,000. If the window were below about 25,000 tokens, Claude Code's instructions would be silently cut, and the server administrator would have to be asked to raise `num_ctx`.
3. **Cold load of 285 seconds** (almost 5 minutes; afterwards 2 to 16 seconds): the first request after inactivity (keep-alive about 5 minutes) includes loading the model onto the GPU, perhaps unloading another model too. This is why `API_TIMEOUT_MS=1200000` (20 minutes) is essential, and the chat shows "המודל נטען, זה יכול לקחת כמה דקות" when the answer is delayed.
4. **Prompt processing speed:** about 3,000 tokens per second (50,000 in 16 seconds); a first message of about 25,000 tokens takes about 8 seconds once the model is loaded.

## 4. VS Code and the existing extension

| Finding | Reason | Meaning |
|---|---|---|
| VS Code **1.91.1** | `code --version` | No secondary side bar (falls back to the activity bar); every new feature must fit the 1.91 API |
| The existing extension **works** there | The user's report | The manual checks were marked as passing on the user's report (not checked one by one; the plan-approval buttons failed and were left for last) |
| Ctrl+Shift+Esc is taken by Windows | Known, noted in `spec.md` | Alternative shortcut Ctrl+Alt+C |

## 5. Assumptions and what is still unknown

| Item | State |
|---|---|
| IDE server (lock-file format, protocol, whether the CLI connects) | Not verified; a prototype by me; fallback: chips |
| `qwen3.8:27b` is loaded with 64,000 | Inferred from `gemma4:26b` and the plateau test (at least 50,000); to be confirmed with `/api/ps` while it is loaded |
| Real capabilities of each model (`/api/show` on port 11435) | Not verified |
| Vision and tools on the other models | Only `qwen3.8:27b`, `gemma4:26b` (with Bash/OK) and `gemma3:27b` (fails) were tested; vision only on `qwen3.8:27b` |
| Auto mode on dangerous actions | Not tested |
| Plan-approval buttons (`ExitPlanMode`) | Do not appear; checked last |
| The shape of a Bash request that needs permission | Not seen (not blocking) |
| Chat-tab behaviour after Reload Window in VS Code | Not tested |
| A real screen reader (accessibility) | Not tested |
| The values of 20 to 25 checks sent from other CLI versions | Not tested (everything is against 2.1.246) |
| Why `claude mcp add` failed silently the first time (through `claude.cmd`, with the phrase `=>` in the command) and worked later with a simple command | Unknown. The guess that the `>` sign was read as output redirection was **not confirmed** (no stray file was found); it may be related to the wrapper |
