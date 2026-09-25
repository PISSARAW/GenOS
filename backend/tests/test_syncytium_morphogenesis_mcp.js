'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const store = require('../src/services/topologySessionStore');
const tools = require('../src/services/topologySessionTools');

async function main() {
  const session = await syncytium.createSession('MCP morphology handoff.', {
    nuclearDomains: [
      { domainId: 'north', members: ['north-agent'] },
      { domainId: 'south', members: ['south-agent'] }
    ]
  });
  const originalLoad = store.load;
  store.load = async () => ({ topology: 'syncytium' });
  try {
    const result = await tools.applyTopologyOperation(undefined, {
      session_id: session.sessionId,
      operation: 'morphogenesis',
      signals: { disagreementCentrality: 0.9 }
    });
    assert.equal(result.targetTopology, 'biocenose');
    assert.equal(result.morphogenesisPlan.selectedTopology, 'biocenose');
    console.log('Syncytium MCP morphogenesis handoff checks: PASS');
  } finally {
    store.load = originalLoad;
    await syncytium.closeSession(session.sessionId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
