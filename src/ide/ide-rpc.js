// The IDE server's MCP JSON-RPC side (PLAN.md section 7). Pure: the editor work is injected as
// `deps`. Method and tool names follow public knowledge of the official extension and are NOT
// verified against CLI 2.1.246: unknown methods are answered with an error and logged, so a
// verbose-log run (tag `ide`) shows what the CLI really asks for. Adjust TOOLS / names here.
const SERVER_NAME = 'claude-local-ide';
const SERVER_VERSION = '0.1.0';
const DEFAULT_PROTOCOL = '2025-03-26';

const TOOLS = [
  {
    name: 'getDiagnostics',
    description: 'Get language diagnostics (errors, warnings) from VS Code, for one file or all files.',
    inputSchema: { type: 'object', properties: { uri: { type: 'string', description: 'File URI or path; omit for all files' } } },
  },
  {
    name: 'getOpenEditors',
    description: 'List the editor tabs open in VS Code.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'openFile',
    description: 'Open a file in the VS Code editor, optionally selecting from startText to endText.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        preview: { type: 'boolean' },
        startText: { type: 'string' },
        endText: { type: 'string' },
        makeFrontmost: { type: 'boolean' },
      },
      required: ['filePath'],
    },
  },
];

// deps: { getDiagnostics(args), getOpenEditors(args), openFile(args) } -> value (JSON-able) or throws.
// Returns handle(msg) -> reply object or null (notifications get no reply).
function createIdeRpc({ deps, log = () => {}, onInitialized = () => {} }) {
  const names = new Set(TOOLS.map((t) => t.name));
  return async function handle(msg) {
    if (!msg || typeof msg !== 'object') return null;
    const { id, method, params } = msg;
    if (id === undefined || id === null) {
      log(`notification ${method}`);
      if (method === 'notifications/initialized') onInitialized();
      return null;
    }
    if (method === undefined) return null; // a response to something we sent
    const ok = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
    log(`request ${method}${method === 'tools/call' && params ? ` ${params.name}` : ''}`);
    switch (method) {
      case 'initialize':
        return ok({
          protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
      case 'ping':
        return ok({});
      case 'tools/list':
        return ok({ tools: TOOLS });
      case 'tools/call': {
        const name = params && params.name;
        if (!names.has(name) || typeof deps[name] !== 'function') {
          log(`unknown tool ${name}`, 'warn');
          return fail(-32602, `Unknown tool ${name}`);
        }
        try {
          const value = await deps[name]((params && params.arguments) || {});
          const text = typeof value === 'string' ? value : JSON.stringify(value);
          return ok({ content: [{ type: 'text', text }] });
        } catch (err) {
          log(`tool ${name} failed: ${err && err.message}`, 'warn');
          return ok({ content: [{ type: 'text', text: `Error: ${err && err.message}` }], isError: true });
        }
      }
      default:
        log(`unknown method ${method}`, 'warn');
        return fail(-32601, `Method not found: ${method}`);
    }
  };
}

// `sel`: {filePath, text, start:{line,character}, end:{line,character}} with 0-based positions.
function selectionChanged(sel, fileUrl) {
  return {
    jsonrpc: '2.0',
    method: 'selection_changed',
    params: {
      text: sel.text,
      filePath: sel.filePath,
      fileUrl,
      selection: { start: sel.start, end: sel.end, isEmpty: sel.text === '' },
    },
  };
}

module.exports = { createIdeRpc, selectionChanged, TOOLS, SERVER_NAME };
