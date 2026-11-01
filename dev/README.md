# dev/ — development-only tools

Nothing in this folder is packaged (`.vscodeignore`). Findings produced by the probes are recorded in `DEPENDENCIES.md` (sections 2-5); this file only says how to run the tools again.

## CLI probes (feasibility checks against the real `claude` CLI)

Each probe spawns the CLI the way the extension does (stream-json + control protocol), in a throw-away folder under `%TEMP%\claude-probe-*`, and writes a JSON report after every check (Ctrl+C keeps what already ran).

| Script | Checks | Needs |
|---|---|---|
| `probe-cli.js` | `p1`-`p8`, first version | the repo (`require('../src/cli/...')`); superseded by `probe-standalone.js` |
| `probe-standalone.js` | `p1_initialize`, `p2_control_requests`, `p3_plain_turn`, `p4_message_during_turn`, `p5_slash_commands`, `p6_updated_input`, `p7_todo_shell_background`, `p8_loop` | Node 18+ only; one self-contained file |
| `probe2-standalone.js` | `q1_rewind`, `q2_updated_input`, `q3_permission_shapes`, `q4_modes`, `q5_vision`, `q6_thinking_effort`, `q7_mcp`, `q8_loop`, `q9_interrupt_resume`, `q10_bang_shell` | same |
| `probe3-standalone.js` | `s1a_rewind_with_env`, `s1b_rewind_without_env`, `s2_updated_input`, `s3_permission_shapes`, `s4_set_model`, `s5_auto_mode` | same; `--alt-model` (default `gemma3:27b`) for `s4` |

The standalone files do not need the repo, git or the network: copy one file to the machine that has the CLI and the local model.

```powershell
node probe3-standalone.js --claude "C:\Users\206861775\AppData\Local\Programs\ClaudeCode\claude-bin.exe" --out probe3-report.json
```

| Option | Meaning |
|---|---|
| `--claude <path>` | the executable (default `claude`). Use `claude-bin.exe`, not the `claude.cmd` wrapper, which asks for a model number and stalls the run (`DEPENDENCIES.md` section 2, finding 1) |
| `--out <file>` | report path (default `probe-report.json`; a re-run overwrites it, pass another name to keep both) |
| `--only p1,p2` | run only checks whose name starts with these prefixes. Run a short pair first (`--only p1,p2`, `--only q4,q5`, `--only s1,s3`) to see that everything works |
| `--turn-timeout <sec>` | wait per model answer (defaults: 180 / 240 / 240). Raise it for a slow or cold model (a cold load took 285 s) |

- Duration with a local model: about 10-30 minutes for `probe-standalone.js`, 25-50 for `probe2-standalone.js`. If `p3`/`q*` first checks end with `timedOut=true`, the model is not answering: stop and verify `claude -p "Reply with the single word OK"` first.
- Safety: the probes auto-approve only one simple Bash command starting with `ping`, `sleep`, `echo` or `timeout` (no shell operators `& | ; < > \` $`, at most 120 characters) and an `Edit` of `a.txt` in the temp folder (`Read` of it as well in `probe3`). Everything else is denied and listed in the report (`permissionsAsked`). `p8`/`q8` start `/loop`; it dies with the process.
- What the later probes additionally approve: `probe2` also answers `AskUserQuestion` (first option), approves `ExitPlanMode`, and for `/loop` the tools `CronCreate`, `CronList`, `CronDelete`, `ScheduleWakeup`; `q7_mcp` switches the first MCP server off and on again inside the temp process only; `q1_rewind` / `s1a` enable file checkpoints only through `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` + `--replay-user-messages` in the temp process. `probe3` approves `Read`/`Edit` of `a.txt`, `Write` of `b.txt` only, `node --version` in Bash and `ExitPlanMode`; `s5_auto_mode` denies every permission request and records whether it was asked; `s4_set_model` switches the server's model to `--alt-model` for a moment and back (it loads a second model). Without `s4`: `--only s1,s2,s3,s5`; without the long `/loop` check: `--only q1,q2,q3,q4,q5,q6,q7,q9,q10`.
- What each probe-3 check does: `s1a` creates `a.txt`, has the model read and edit it (`two` → `TWO`), then `rewind_files` (success key `rewindProven`); `s1b` the same without the env var (shows that the saved `checkpoints=true` setting is not enough); `s2` replaces the new text with `PROBE_CHANGED` in the permission request and checks the file (`updatedInputHonoured`); `s3` records every field of Write (allow / deny), Bash and plan-mode `ExitPlanMode` permission requests including `permission_suggestions`; `s4` `set_model` to the alt model, then to a non-existing name, then back; `s5` `set_permission_mode auto` and a file-creation request.
- Sending a report back from a machine without GitHub: `Get-Content probe3-report.json -Raw | Set-Clipboard`, then paste.
- The reports hold only field names of the account, but they contain model answers and folder paths: read them before sending.
- Clean-up: delete `%TEMP%\claude-probe-*` and the CLI transcripts folders `~\.claude\projects\*claude-probe*`.
- Troubleshooting: `ENOENT` / "not recognized" → pass the full path (`where.exe claude`); `initialize timed out` → run `claude-bin.exe --version` by hand; `unknown option` → CLI too old (the extension targets 2.1.181+; probed on 2.1.246).
- PowerShell pitfalls seen on the user's machine: a quoted path needs `&` before it; `$claude` works only if it was set in the same window (a full path is safer); run a probe from the folder that holds the script (`cd` there first); a multi-line block can be cut when pasted; `--claude` takes the path of `claude-bin.exe`, not of the script.
- The CLI refuses an `Edit` of a file it has not read, so a probe that denies `Read` never reaches the permission request for the edit (this made `q1`-`q3` inconclusive and is why `probe3` approves `Read` of `a.txt`).
- Manual checks that go with the probes (PowerShell; see the pitfalls above):
  - model capabilities: `POST http://172.27.5.5:11435/api/show` with `{"model":"<id>"}` → `capabilities` (not verified yet);
  - IDE server: `claude --help | Select-String ide`, `Get-ChildItem "$env:USERPROFILE\.claude\ide"`, then `/ide` inside a VS Code terminal (result so far: "No available IDEs detected");
  - MCP add/remove: `claude mcp add probe-test -- node --version`, `claude mcp list`, `claude mcp remove probe-test`;
  - fork/resume flags: `claude --help | Select-String "fork|resume|rewind|continue"`;
  - start with a chosen model: `& "<path>\claude-bin.exe" -p "Reply with the single word OK" --model gemma4:26b --output-format json` (loads that model on the shared server; a cold load can take minutes);
  - context-window plateau test through the gateway (on a quiet server; the last calls can take minutes): for `n` in 2000, 6000, 12000, 25000, 50000, 100000 POST `http://172.27.5.5:11436/v1/chat/completions` with `{"model":"qwen3.8:27b","max_tokens":5,"messages":[{"role":"user","content":"<n times 'word '>Reply OK"}]}` and print `usage.prompt_tokens`. If it stops growing at some value, that is the window; if it keeps growing, the window is at least that large. Result: no plateau up to 50,012 (`DEPENDENCIES.md` section 3.6);
  - what Ollama really loaded: `GET http://172.27.5.5:11435/api/ps` (`context_length`).

## Gateway probe (`gateway-probe/`)

A tiny VS Code extension (`package.json`, `probe.js`, `extension.js`) that proves the extension host can reach the LiteLLM gateway; plain Node, read-only (GET, plus one POST to `/utils/token_counter` that does not run a model).

1. Terminal baseline: `cd dev\gateway-probe` then `node probe.js [--url http://172.27.5.5:11436] [--key ollama] [--model qwen3.8:27b] [--out result.json]`. One OK/FAIL line per endpoint; the full result goes to `gateway-probe-result.json`.
2. Inside VS Code: `code --extensionDevelopmentPath=<repo>\dev\gateway-probe`, then in the new window F1 → `Gateway Probe: Run`. The output channel "Gateway Probe" shows the same lines plus the VS Code version and proxy settings; the buttons "Copy summary" / "Open full result" (`%TEMP%\gateway-probe-result-extension-host.json`). Settings: `gatewayProbe.baseUrl`, `gatewayProbe.apiKey`, `gatewayProbe.model`.
3. Reading it: OK on `/v1/models` from VS Code means the extension can fetch the model list; `401` = another key is needed; `404/405` = endpoint not exposed; `ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` = network or proxy block. If the terminal works and VS Code does not, the cause is VS Code's proxy settings.

Result (2026-11-01): all endpoints reachable from the extension host in 15-250 ms; see `DEPENDENCIES.md` section 3.2.

## Chat UI without VS Code

- `fake-claude.js` / `fake-claude.cmd`: a fake stream-json CLI for tests and for trying the UI without a model (`claudeLocal.claudePath` = `dev/fake-claude.cmd`). Scenario by keyword in the message: `tool` (Bash permission), `שאלה` (AskUserQuestion), `slow` (long reply, for the stop button); otherwise a Markdown reply. `FAKE_CLAUDE_INTERRUPT=no-result|error` changes what follows an interrupt. It rejects `bypassPermissions` unless started with `--allow-dangerously-skip-permissions`, like the real CLI.
- `preview-server.js`, `preview-host.js`, `preview-theme.css`: the chat webview in a normal browser with a simulated host and VS Code theme variables: `node dev/preview-server.js [port]` (default 5199), or the "chat-preview" entry in `.claude/launch.json`.

## Reference

- `claude-code-vscode-guide-he.html`: a Hebrew guide to the official extension's 24 feature areas, the reference the roadmap in `PLAN.md` was decided from.
