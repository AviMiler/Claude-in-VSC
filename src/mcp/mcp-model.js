// Pure: turns the CLI's `mcp_status` response into the rows the dialog shows.
// The exact fields beyond `name` and `status` are not documented, so everything is read defensively.

const STATUS_TEXT = {
  connected: 'מחובר',
  pending: 'מתחבר…',
  failed: 'נכשל',
  disabled: 'מושבת',
  'needs-auth': 'דורש הרשאה',
};

function normalizeServers(response) {
  const list = response && Array.isArray(response.mcpServers) ? response.mcpServers : [];
  return list
    .filter((s) => s && typeof s.name === 'string')
    .map((s) => {
      const status = typeof s.status === 'string' ? s.status : 'pending';
      const tools = Array.isArray(s.tools) ? s.tools : [];
      return {
        name: s.name,
        status,
        statusText: STATUS_TEXT[status] || status,
        scope: typeof s.scope === 'string' ? s.scope : '',
        toolCount: tools.length,
        error: typeof s.error === 'string' ? s.error : '',
        enabled: status !== 'disabled',
      };
    });
}

module.exports = { normalizeServers, STATUS_TEXT };
