'use strict';

function simulateRule1(context) {
  return context.cycle % 100 === 0 && context.cycle < context.CYCLES && context.finiteAgents(context.agents);
}

function main(context) {
  return context.observed.cycles === context.CYCLES && context.observed.agents === context.AGENT_COUNT && context.observed.topologySteps === context.CYCLES * 4 && context.observed.shocksInjected === 9 && context.observed.shocksRecovered === 9 && context.observed.relationshipEdges === context.AGENT_COUNT * 2 && context.observed.finiteState && context.observed.maximumRadius <= 12;
}

function simulateRule3(context) {
  return !context.finiteAgents(context.agents) || context.agents.length !== context.AGENT_COUNT || context.edges.length !== context.AGENT_COUNT * 2;
}

module.exports = { simulateRule1, main, simulateRule3 };
