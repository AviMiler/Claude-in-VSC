// The inline --mcp-config value for the navigation server (no file is written).
const NAV_SERVER_NAME = 'claude-local-nav';
// For --allowedTools: every tool of our own server only, so no approval card per call.
const NAV_ALLOWED_TOOL = `mcp__${NAV_SERVER_NAME}`;

function buildMcpConfig({ url, token }) {
  return JSON.stringify({
    mcpServers: { [NAV_SERVER_NAME]: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } },
  });
}

module.exports = { buildMcpConfig, NAV_SERVER_NAME, NAV_ALLOWED_TOOL };
