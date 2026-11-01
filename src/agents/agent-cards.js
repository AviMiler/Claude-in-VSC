// Host side of the agent cards: feeds raw CLI lines to the pure agent map, posts the changed
// cards to the webview (`agentCards`) and logs starts and ends under [agents] (ids, types,
// counts only; never the prompt or the summary text).
const { TAGS } = require('../util/log-tags');
const agentMap = require('./agent-map');

function createAgentCards() {
  return { map: agentMap.createAgentMap(), logged: new Map() }; // card id -> last logged state
}

// conv: the Conversation (post, services.logger).
function trackAgents(conv, state, msg) {
  const ids = agentMap.applyMessage(state.map, msg);
  if (!ids.length) return;
  const cards = agentMap.listCards(state.map, ids);
  for (const c of cards) {
    const prev = state.logged.get(c.id);
    if (prev === c.state) continue;
    state.logged.set(c.id, c.state);
    if (!prev) conv.services.logger.info(TAGS.AGENTS, `card ${c.id} started (subagent=${c.subagentType || '?'}, background=${c.background})`);
    else conv.services.logger.info(TAGS.AGENTS, `card ${c.id} ${c.state} (tools=${c.toolUses || c.tools.length}, ms=${c.durationMs === undefined ? '?' : c.durationMs}, summary=${c.summary ? 'yes' : 'no'})`);
  }
  conv.post({ type: 'agentCards', cards });
}

module.exports = { createAgentCards, trackAgents };
