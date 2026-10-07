'use strict';

const assert = require('node:assert/strict');
const database = require('../src/db');
const originalDatabase = database.getDatabase;
database.getDatabase = async () => { throw new Error('signal database unavailable'); };
const handlers = require('../src/services/mcpBioTools/handlers/signalTransport');

async function run() {
  const plasmid = await handlers.handleSignalPlasmidTransfer({ problem: 'choice', voters: [{ agentId: 'a' }] });
  assert.equal(plasmid.success, false);
  assert.equal(plasmid.status, 'not_implemented');
  assert.equal(plasmid.proposedRecipients, 1);

  for (const mode of ['stigmergic', 'plasmid']) {
    const decision = await handlers.handleSignalCollectiveDecision({ problem: 'choice', voters: [], mode });
    assert.equal(decision.success, false);
    assert.equal(decision.status, 'not_implemented');
  }

  const gradient = await handlers.handleSignalChemotacticFollow({ agent_id: 'a', locus_hash: 'test' });
  assert.equal(gradient.success, false);
  assert.equal(gradient.status, 'tool_error');
  assert.match(gradient.error, /database unavailable/);
}

run().then(() => { database.getDatabase = originalDatabase; }).catch((error) => {
  database.getDatabase = originalDatabase;
  console.error(error);
  process.exitCode = 1;
});
