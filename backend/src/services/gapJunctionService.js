'use strict';

function createJunction(agentA, agentB) {
  return { id: [agentA, agentB].sort().join(':'), agents: [agentA, agentB], version: 0, state: {} };
}

function exchange(junction, sender, delta = {}) {
  if (!junction.agents.includes(sender)) throw new Error('Sender is not connected to this junction.');
  junction.version += 1;
  junction.state = { ...junction.state, ...delta };
  return { junctionId: junction.id, version: junction.version, target: junction.agents.find((agent) => agent !== sender), delta };
}

module.exports = { createJunction, exchange };
