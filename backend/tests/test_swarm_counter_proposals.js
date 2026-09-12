const assert = require('assert');
const { getDatabase } = require('../src/db');
const { createProposal, createCounterProposal, getConsensus } = require('../src/controllers/swarmController');

async function run() {
  process.env.GENOS_ADMIN_PASSWORD = 'test-admin-password-secure-123';
  const db = await getDatabase();
  const wsId = `ws-counter-${Date.now()}`;
  await db.run("INSERT INTO workspaces (id, name, path) VALUES (?, ?, ?)", wsId, `ws-name-${wsId}`, `/path/${wsId}`);

  // 1. Create primary proposal
  let primaryId = null;
  await createProposal({
    body: { title: 'Adopt Strategy Alpha', description: 'Primary proposal', quorumThreshold: 0.6, workspaceId: wsId }
  }, {
    status: (code) => ({
      json: (data) => {
        assert.equal(code, 201);
        primaryId = data.proposalId;
      }
    })
  });
  assert.ok(primaryId, 'Primary proposal must be created');

  // 2. Create counter-proposal to primary proposal
  let counterId = null;
  let counterResult = null;
  await createCounterProposal({
    params: { id: primaryId },
    body: { title: 'Adopt Strategy Beta Instead', description: 'Counter proposal with lower blast radius', quorumThreshold: 0.5 }
  }, {
    status: (code) => ({
      json: (data) => {
        counterResult = { code, data };
        counterId = data.proposalId;
      }
    })
  });

  assert.equal(counterResult.code, 201);
  assert.equal(counterResult.data.parentProposalId, primaryId);
  assert.ok(counterId, 'Counter proposal must be created');

  // 3. Verify in database
  const counterRow = await db.get('SELECT * FROM swarm_proposals WHERE id = ?', counterId);
  assert.equal(counterRow.parent_proposal_id, primaryId);

  // 4. Test error on non-existent parent proposal
  let errNotFound = null;
  await createCounterProposal({
    params: { id: 'non-existent-prop' },
    body: { title: 'Invalid counter' }
  }, {
    status: (code) => ({
      json: (data) => { errNotFound = { code, data }; }
    })
  });
  assert.equal(errNotFound.code, 404);
  assert.equal(errNotFound.data.error.code, 'PROPOSAL_NOT_FOUND');

  // 5. Test consensus listing includes counter-proposal relations
  let consensusData = null;
  await getConsensus({
    query: {}
  }, {
    json: (data) => { consensusData = data; }
  });

  assert(consensusData, 'Consensus data should be returned');
  const primaryView = consensusData.proposals.find((p) => p.id === primaryId);
  const counterView = consensusData.proposals.find((p) => p.id === counterId);

  assert.ok(primaryView, 'Primary proposal must be listed');
  assert.ok(counterView, 'Counter proposal must be listed');
  assert.equal(counterView.parentProposalId, primaryId);
  assert(primaryView.counterProposals.includes(counterId), 'Primary proposal must list counterId in counterProposals');

  console.log('✅ PASS: test_swarm_counter_proposals succeeded.');
}

run().catch((err) => {
  console.error('❌ FAIL:', err);
  process.exit(1);
});
