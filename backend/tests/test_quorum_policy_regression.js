const assert = require('assert');
const test = require('node:test');
const qp = require('../src/services/primitiveHandlers/quorumPolicy');
const { quorum, weightedQuorum, brierScores } = require('../src/services/primitiveHandlers/collectiveConsensus');
const { getDatabase } = require('../src/db');

test('quorum policy non-regression suite', async (t) => {
  const db = await getDatabase();
  const orchestratorId = `orch-regression-${Date.now()}`;

  const insertVote = async (senderAgentId, issue, voteValue) => {
    await db.run(
      `INSERT INTO agent_organization_messages (
        orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json, delivery
      ) VALUES (?, 'test_org', 1, ?, 'broadcast', 'general', 'vote', 'vote message', ?, 'delivered')`,
      orchestratorId, senderAgentId, JSON.stringify({ issue, vote: voteValue })
    );
  };

  await t.test('exact tie resolves to tied without inventing a winner', async () => {
    const issue = `tie-simple-${Date.now()}`;
    await insertVote('agent-tie-1', issue, 'yes');
    await insertVote('agent-tie-2', issue, 'no');
    const res = await quorum({ orchestratorId, issue, minVotes: 2, threshold: 0.5 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, false);
    assert.strictEqual(res.decision, null);
    assert.strictEqual(res.status, 'tied');
  });

  await t.test('weighted exact tie resolves to tied', async () => {
    const issue = `tie-weighted-${Date.now()}`;
    await insertVote('agent-tie-3', issue, 'beta_candidate');
    await insertVote('agent-tie-4', issue, 'alpha_candidate');
    const res = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 2,
      threshold: 0.4,
      calibrationScores: { 'agent-tie-3': 0.2, 'agent-tie-4': 0.2 }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, false);
    assert.strictEqual(res.decision, null);
    assert.strictEqual(res.status, 'tied');
  });

  await t.test('a single vote never reaches quorum by default', async () => {
    const issue = `single-vote-${Date.now()}`;
    await insertVote('agent-solo', issue, 'yes');
    const res = await quorum({ orchestratorId, issue, threshold: 0.5 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, false);
    assert.strictEqual(res.decision, null);
  });

  await t.test('default floor follows activeCount: max(2, ceil(active * 0.5))', async () => {
    const issue = `active-floor-${Date.now()}`;
    await insertVote('agent-a1', issue, 'yes');
    await insertVote('agent-a2', issue, 'yes');
    const reached = await quorum({ orchestratorId, issue, threshold: 0.5, activeCount: 4 });
    assert.strictEqual(reached.success, true);
    assert.strictEqual(reached.quorumReached, true);
    assert.strictEqual(reached.decision, 'yes');
    const short = await quorum({ orchestratorId, issue, threshold: 0.5, activeCount: 6 });
    assert.strictEqual(short.success, true);
    assert.strictEqual(short.quorumReached, false);
    assert.strictEqual(short.decision, null);
  });

  await t.test('abstentions are coherent: excluded from approval, kept in participation', async () => {
    const issue = `abstention-${Date.now()}`;
    await insertVote('agent-v1', issue, 'yes');
    await insertVote('agent-b1', issue, 'abstain');
    await insertVote('agent-b2', issue, 'abstain');
    const res = await quorum({ orchestratorId, issue, threshold: 0.5 });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'yes');
    assert.strictEqual(res.totalVotes, 3);
    assert.strictEqual(res.expressedVotes, 1);
    assert.strictEqual(res.abstentions, 2);
    assert.strictEqual(res.participationCount, 3);
    assert.strictEqual(res.approvalRate, 1);
    const tally = qp.tallySwarmVotes({
      votes: [{ vote: 'yes', weight: 1 }, { vote: 'abstain', weight: 1 }, { vote: 'abstain', weight: 1 }],
      weighted: false
    });
    assert.strictEqual(tally.participationCount, 3);
    assert.strictEqual(tally.abstainCount, 2);
    assert.strictEqual(tally.yesCount + tally.noCount, 1);
  });

  await t.test('NaN calibration items are filtered before averaging', async () => {
    const res = await brierScores({
      agentIds: ['agent-nan-filter'],
      calibrationObservations: [
        { agentId: 'agent-nan-filter', prediction: 0.8, outcome: 1 },
        { agentId: 'agent-nan-filter', prediction: 'not-a-number', outcome: 1 }
      ]
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.scores['agent-nan-filter'], 0.04);
  });

  await t.test('brier weight is continuous with no cliff at 0.5', async () => {
    assert.strictEqual(qp.brierScoreToWeight(0.5), 0.25);
    assert.strictEqual(qp.brierScoreToWeight(0), 1);
    assert.strictEqual(qp.brierScoreToWeight(1), 0);
    const below = qp.brierScoreToWeight(0.499);
    const above = qp.brierScoreToWeight(0.5);
    assert.ok(Math.abs(below - above) < 0.01);
  });
});
