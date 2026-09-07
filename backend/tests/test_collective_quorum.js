const assert = require('assert');
const test = require('node:test');
const { quorum, weightedQuorum } = require('../src/services/primitiveHandlers/collective');
const { getDatabase } = require('../src/db');

test('collective quorum and weightedQuorum threshold verification', async (t) => {
  const db = await getDatabase();
  const orchestratorId = `orch-test-${Date.now()}`;
  const issue = 'deploy_strategy';

  const insertVote = async (senderAgentId, voteValue) => {
    await db.run(
      `INSERT INTO agent_organization_messages (
        orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json, delivery
      ) VALUES (?, 'test_org', 1, ?, 'broadcast', 'general', 'vote', 'vote message', ?, 'delivered')`,
      orchestratorId, senderAgentId, JSON.stringify({ issue, vote: voteValue })
    );
  };

  // Seed sample votes
  await insertVote('agent-1', 'canary');
  await insertVote('agent-2', 'blue-green');

  await t.test('fails when minVotes threshold is not met', async () => {
    const res = await quorum({
      orchestratorId,
      issue,
      minVotes: 5,
      threshold: 0.5
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, false);
    assert.strictEqual(res.decision, null);
    assert.strictEqual(res.totalVotes, 2);
  });

  await t.test('fails when approval threshold is not met (tie / split)', async () => {
    const res = await quorum({
      orchestratorId,
      issue,
      minVotes: 2,
      threshold: 0.75 // 1/2 = 0.5 < 0.75
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, false);
    assert.strictEqual(res.decision, null);
  });

  await t.test('succeeds when majority threshold and minVotes are reached', async () => {
    // Add third vote for canary
    await insertVote('agent-3', 'canary');

    const res = await quorum({
      orchestratorId,
      issue,
      minVotes: 3,
      threshold: 0.6
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'canary');
    assert.strictEqual(res.totalVotes, 3);
  });

  await t.test('weightedQuorum checks minParticipation and threshold', async () => {
    const res = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 2,
      threshold: 0.5,
      calibrationScores: {
        'agent-1': 0.1, // low brier = high weight
        'agent-2': 0.8, // high brier = 0 weight
        'agent-3': 0.1
      }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'canary');
  });

  await t.test('sql issue filter prevents vote eviction by unrelated issues', async () => {
    // Flood database with 60 votes on an unrelated issue
    for (let i = 0; i < 60; i++) {
      await db.run(
        `INSERT INTO agent_organization_messages (
          orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json, delivery
        ) VALUES (?, 'test_org', 1, ?, 'broadcast', 'general', 'vote', 'vote message', ?, 'delivered')`,
        orchestratorId, `flooder-${i}`, JSON.stringify({ issue: 'other_unrelated_issue', vote: 'noise' })
      );
    }

    const res = await quorum({
      orchestratorId,
      issue,
      minVotes: 3,
      threshold: 0.6
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'canary');
    assert.strictEqual(res.totalVotes, 3);
  });
});
