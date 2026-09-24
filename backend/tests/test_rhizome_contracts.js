const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const { normalizeRhizomeSession } = require('../src/services/rhizome/contracts/rhizomeSession');
const { normalizeCapabilityNode } = require('../src/services/rhizome/contracts/capabilityNode');
const { normalizeCapabilityEdge } = require('../src/services/rhizome/contracts/capabilityEdge');
const { normalizeCapabilityNeed } = require('../src/services/rhizome/contracts/capabilityNeed');

function node(nodeId, capability) {
  return normalizeCapabilityNode({
    nodeId,
    kind: 'TOOL',
    capabilities: [capability],
    providers: [{ providerId: 'mcp-search', kind: 'tool', reference: 'search' }]
  });
}

async function run() {
  const source = node('source', 'search');
  const target = node('target', 'summarize');
  const edge = normalizeCapabilityEdge({ edgeId: 'bridge-1', from: source.nodeId, to: target.nodeId, relation: 'BRIDGES' });
  const need = normalizeCapabilityNeed({ needId: 'need-1', capability: 'summarize', criticality: 0.8 });
  const graph = normalizeRhizomeSession({
    rhizomeId: 'rhizome-1', missionId: 'mission-1', graphVersion: 1,
    nodes: [source, target], edges: [edge], activeNeeds: [need]
  });
  assert.equal(graph.edges[0].from, 'source');
  assert.equal(graph.activeNeeds[0].constraints.privacy, 'ANY');
  assert.equal(graph.edges[0].trailState.verifiedFlow, 0);
  assert.equal(graph.nodes[0].providers[0].providerId, 'mcp-search');
  assert.notEqual(graph.nodes[0].nodeId, graph.nodes[0].providers[0].providerId);
  assert.throws(() => normalizeCapabilityEdge({ edgeId: 'bad', from: 'same', to: 'same', relation: 'BRIDGES' }), { code: 'RHIZOME_CONTRACT_INVALID' });
  assert.throws(() => normalizeRhizomeSession({ rhizomeId: 'x', missionId: 'm', graphVersion: 1, nodes: [source], edges: [edge] }), { code: 'RHIZOME_CONTRACT_INVALID' });

  const session = await rhizome.composeRhizome('Keep the capability graph independent from its workers.');
  assert.equal(session.graphVersion, 0);
  assert.deepEqual(session.nodes, []);
  assert.equal(session.members.length, 4);
  assert.equal(session.rhizomeId, session.sessionId);
}

run().then(() => console.log('Rhizome contract checks: PASS')).catch((error) => {
  console.error('Rhizome contract test failed:', error);
  process.exit(1);
});
