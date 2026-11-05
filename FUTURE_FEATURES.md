# Future features: ideas not yet in the plan

This is a **parking place for ideas**. Nothing here is decided, scheduled or built. Each idea is reviewed with the user one by one; an approved idea moves into `PLAN.md` (stage table, settings, build order) and is removed from here. Rejected ideas are marked and kept so they are not proposed again.

**Status values:** 💡 idea, not discussed · 🗣️ discussed, open questions · ✅ approved, move to `PLAN.md` · ❌ rejected.

## 1. Code navigation for Claude (requested 2026-11-05)

**Goal:** let Claude find and move around code by meaning (symbols, definitions, references) instead of only by text (`Grep`/`Glob`/`Read`), and keep the answers small, because the real context window is about 64,000 tokens.

### 1.1 Approach: use VS Code's language features, not a language server of our own — 🗣️
- VS Code already runs language servers (TypeScript/JavaScript built in; Python, C#, Java and others through extensions) and exposes their results through `vscode.commands.executeCommand('vscode.execute…Provider', …)`. The extension would only translate those results into tool answers.
- Running our own LSP client plus servers would mean shipping and updating servers with no npm and no build, on a machine without internet. Not proposed.
- Limit: a language has navigation only if its VS Code extension is installed on the target machine.
- **The user's languages (2026-11-05):** JavaScript + React (no TypeScript) and C# on .NET 6.
  - JS/JSX: covered by the TypeScript language service built into VS Code; nothing to install. A `jsconfig.json` in the project makes cross-file results more accurate (an assumption to verify).
  - C#: needs a C# extension and the .NET SDK on the machine. **Unknown:** whether one is installed, which one (C# or C# Dev Kit), and whether it works offline. Some versions download language-server components on first use, and VS Code 1.91.1 limits which extension versions can be used. Do not assume it works; check on the machine.
  - **Result of the user's check (2026-11-05):** no extensions are installed in VS Code; JS/React navigation is confirmed to work; C# is probably used only in Visual Studio, not VS Code. So **C# navigation is out of scope for now**: Claude falls back to `Grep`/`Glob`/`Read` on `.cs` files. It could be added later by bringing a C# extension (a file) into the machine, treated as a special case; not planned.
  - Per `AGENT_CONTEXT.md` (no internet), the extension must not install anything itself.

### 1.2 Candidate tools — 💡
| Tool | VS Code API behind it | Returns |
|---|---|---|
| `findReferences` | `vscode.executeReferenceProvider` | Locations grouped by file, one line of source each |
| `goToDefinition` | `vscode.executeDefinitionProvider`, `vscode.executeTypeDefinitionProvider`, `vscode.executeImplementationProvider` | Location plus a few lines of the declaration |
| `hover` | `vscode.executeHoverProvider` | Type, signature, doc text |
| `documentSymbols` | `vscode.executeDocumentSymbolProvider` | File outline (names, kinds, line ranges); far cheaper than reading the file |
| `workspaceSymbols` | `vscode.executeWorkspaceSymbolProvider` | Matches by name across the workspace |
| `callHierarchy` | `vscode.prepareCallHierarchy`, `vscode.provideIncomingCalls`, `vscode.provideOutgoingCalls` | Callers and callees (a later addition) |
| `getDiagnostics` | `vscode.languages.getDiagnostics` | Already in `PLAN.md` (IDE server); listed here only for completeness |

### 1.3 Design ideas — 💡
- **Input by name, not position:** `file` + `symbol` (+ optional `line`) instead of raw line/column, because a local model gets positions wrong. The tool resolves the name through `documentSymbols` or a text match on that line.
- **Size caps:** about 50 references and 2,000 characters per answer, ending with "N more not shown".
- **Plain failure:** when a language has no provider, the tool says so, and Claude falls back to `Grep`.
- **Tests:** unit tests for the pure parts (result shaping, caps, name-to-position) with fake provider results; a manual check in real VS Code per language.

### 1.4 Delivery: how the CLI gets the tools — 💡 (needs a prototype)
- **Option A, the IDE server** (`PLAN.md` section 7): register the tools there. Unverified risk: to my knowledge the official extension exposes only a couple of IDE tools to the model, so the CLI may hide extra ones. Not checked on this CLI (2.1.246).
- **Option B, an MCP server of the extension's own:** a small localhost server (hand-written JSON-RPC, no npm) passed to the CLI with `--mcp-config`. Needs no lock file, so it avoids the "the extension writes no files" conflict (`PLAN.md` section 6, item 9).
- Both options reuse the same tool implementations, so the choice can wait for the prototype.

### 1.5 Other helpers worth considering — 💡
- **Repository map:** one call that returns folders plus the top-level symbols per file, so Claude can orient itself cheaply.
- **Open at symbol:** `openFile` that jumps to a symbol, so the user sees what Claude is looking at.

### 1.6 Considered and left out — ❌ (proposed to leave out; user to confirm)
- **Rename / refactor through providers** (`vscode.executeDocumentRenameProvider`): edits must go through the per-block approval flow of package F, so this is not proposed.

### 1.7 Open questions
1. Does the CLI show extra IDE-server tools to the model, or only `getDiagnostics`? (prototype)
2. ~~Which languages?~~ Answered: JS/React works; C# is not available in VS Code (out of scope for now).
3. Is the repository map worth a tool, given that `Glob` and `documentSymbols` already exist?
4. Where in the build order: after package F's IDE prototype, or independent of it (Option B)?
