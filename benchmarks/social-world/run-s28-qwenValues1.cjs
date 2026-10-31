'use strict';

function simulateValue1(__genosValueScope1) {
  return __genosValueScope1.cycle % 100 === 0 && __genosValueScope1.cycle < __genosValueScope1.CYCLES && (0, __genosValueScope1.finiteAgents)(__genosValueScope1.agents);
}

function mainValue2(__genosValueScope2) {
  return __genosValueScope2.observed.cycles === __genosValueScope2.CYCLES && __genosValueScope2.observed.agents === __genosValueScope2.AGENT_COUNT && __genosValueScope2.observed.topologySteps === __genosValueScope2.CYCLES * 4 && __genosValueScope2.observed.shocksInjected === 9 && __genosValueScope2.observed.shocksRecovered === 9 && __genosValueScope2.observed.relationshipEdges === __genosValueScope2.AGENT_COUNT * 2 && __genosValueScope2.observed.finiteState && __genosValueScope2.observed.maximumRadius <= 12;
}

function simulateValue3(__genosValueScope3) {
  return !(0, __genosValueScope3.finiteAgents)(__genosValueScope3.agents) || __genosValueScope3.agents.length !== __genosValueScope3.AGENT_COUNT || __genosValueScope3.edges.length !== __genosValueScope3.AGENT_COUNT * 2;
}

module.exports = { simulateValue1, mainValue2, simulateValue3 };
