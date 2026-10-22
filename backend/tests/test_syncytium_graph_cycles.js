'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createGraphSession('Graph cycle detection.');
  await syncytium.addGraphNode(session.sessionId, { opId: 'n1', actorId: 'alice', id: 'a', value: { nodeId: 'a' } });
  await syncytium.addGraphNode(session.sessionId, { opId: 'n2', actorId: 'alice', id: 'b', value: { nodeId: 'b' } });
  await syncytium.addGraphNode(session.sessionId, { opId: 'n3', actorId: 'alice', id: 'c', value: { nodeId: 'c' } });
  await syncytium.addGraphEdge(session.sessionId, { opId: 'e1', actorId: 'alice', id: 'ab', value: { edgeId: 'ab', source: 'a', target: 'b' } });
  await syncytium.addGraphEdge(session.sessionId, { opId: 'e2', actorId: 'alice', id: 'bc', value: { edgeId: 'bc', source: 'b', target: 'c' } });
  await syncytium.addGraphEdge(session.sessionId, { opId: 'e3', actorId: 'alice', id: 'ca', value: { edgeId: 'ca', source: 'c', target: 'a' } });

  const result = await syncytium.detectGraphCycles(session.sessionId);
  assert.equal(result.hasCycle, true);
  assert.ok(result.cycles.length >= 1);

  const danglingSession = await syncytium.createGraphSession('Dangling edge detection.');
  await syncytium.addGraphNode(danglingSession.sessionId, { opId: 'n1', actorId: 'alice', id: 'a', value: { nodeId: 'a' } });
  await assert.rejects(() => syncytium.addGraphEdge(danglingSession.sessionId, { opId: 'e1', actorId: 'alice', id: 'ax', value: { edgeId: 'ax', source: 'a', target: 'missing' } }), (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT');

  const cleanSession = await syncytium.createGraphSession('Clean graph.');
  await syncytium.addGraphNode(cleanSession.sessionId, { opId: 'n1', actorId: 'alice', id: 'a', value: { nodeId: 'a' } });
  await syncytium.addGraphNode(cleanSession.sessionId, { opId: 'n2', actorId: 'alice', id: 'b', value: { nodeId: 'b' } });
  await syncytium.addGraphEdge(cleanSession.sessionId, { opId: 'e1', actorId: 'alice', id: 'ab', value: { edgeId: 'ab', source: 'a', target: 'b' } });
  const clean = await syncytium.detectGraphCycles(cleanSession.sessionId);
  assert.equal(clean.hasCycle, false);
  assert.equal(clean.hasDangling, false);
}

main().then(() => console.log('Syncytium graph cycle checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});