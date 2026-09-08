const assert = require('assert');
const test = require('node:test');
const { quorum, weightedQuorum } = require('../src/services/primitiveHandlers/collectiveConsensus');
const { getDatabase } = require('../src/db');
const swarmController = require('../src/controllers/swarmController');

test('Weighted Quorum & Brier Consensus Comprehensive Suite', async (t) => {
  const db = await getDatabase();
  const orgId = 'test_org_comprehensive';
  const orchestratorId = 'orch-comp-' + Date.now();

  const insertOrgVote = async (senderAgentId, issue, voteValue) => {
    await db.run(
      `INSERT INTO agent_organization_messages (
        orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json, delivery
      ) VALUES (?, ?, 1, ?, 'broadcast', 'general', 'vote', 'vote message', ?, 'delivered')`,
      orchestratorId, orgId, senderAgentId, JSON.stringify({ issue, vote: voteValue })
    );
  };

  await t.test('1. Selective Brier Weight Formula & Penalty Thresholds', async () => {
    const issue = 'brier_weights_test';
    // agent_perfect: Brier 0.0 -> weight (1-0)^2 = 1.0
    // agent_good: Brier 0.2 -> weight (1-0.2)^2 = 0.64
    // agent_poor: Brier 0.8 -> weight 0.1 * (1 - 0.8) = 0.02
    // agent_worst: Brier 1.0 -> weight 0.0
    await insertOrgVote('agent_perfect', issue, 'option_A');
    await insertOrgVote('agent_good', issue, 'option_A');
    await insertOrgVote('agent_poor', issue, 'option_B');
    await insertOrgVote('agent_worst', issue, 'option_B');

    const res = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 3,
      threshold: 0.5,
      calibrationScores: {
        agent_perfect: 0.0,
        agent_good: 0.2,
        agent_poor: 0.8,
        agent_worst: 1.0,
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'option_A');
    // option_A weight: 1.0 + 0.64 = 1.64
    // option_B weight: 0.02 + 0.0 = 0.02
    assert.strictEqual(res.weightedTally.option_A > 1.6, true);
    assert.strictEqual(res.weightedTally.option_B < 0.1, true);
  });

  await t.test('2. Participation Quorum vs Approval Threshold', async () => {
    const issue = 'participation_quorum_test';
    await insertOrgVote('agent_p1', issue, 'candidate_X');

    // Fails when minVotes participation is not met
    const resLowParticipation = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 3,
      threshold: 0.5,
      calibrationScores: { agent_p1: 0.1 }
    });
    assert.strictEqual(resLowParticipation.quorumReached, false);
    assert.strictEqual(resLowParticipation.decision, null);

    // Add more votes but split so approval threshold 0.8 is not met
    await insertOrgVote('agent_p2', issue, 'candidate_Y');
    await insertOrgVote('agent_p3', issue, 'candidate_Y');
    const resLowApproval = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 3,
      threshold: 0.85,
      calibrationScores: { agent_p1: 0.1, agent_p2: 0.1, agent_p3: 0.1 }
    });
    assert.strictEqual(resLowApproval.quorumReached, false);
    assert.strictEqual(resLowApproval.decision, null);
  });

  await t.test('3. Deterministic Tie-Breaking (localeCompare)', async () => {
    const issue = 'tie_break_test';
    // Equal calibration scores & vote count for candidate_A and candidate_B
    await insertOrgVote('agent_t1', issue, 'beta_candidate');
    await insertOrgVote('agent_t2', issue, 'alpha_candidate');

    const res = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 2,
      threshold: 0.4,
      calibrationScores: {
        agent_t1: 0.2,
        agent_t2: 0.2
      }
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    // alpha_candidate comes before beta_candidate alphabetically
    assert.strictEqual(res.decision, 'alpha_candidate');
  });

  await t.test('4. Abstention Handling (counted for quorum, neutral for decision)', async () => {
    const issue = 'abstention_test';
    await insertOrgVote('agent_vote', issue, 'approved_proposal');
    await insertOrgVote('agent_abstain1', issue, 'abstain');
    await insertOrgVote('agent_abstain2', issue, 'ABSTAIN');

    const res = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 3, // Needs 3 participants: 1 voter + 2 abstainers = 3
      threshold: 0.5,
      calibrationScores: {
        agent_vote: 0.1,
        agent_abstain1: 0.1,
        agent_abstain2: 0.1
      }
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.totalVotes, 3);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'approved_proposal');
    assert.strictEqual(res.weightedTally['abstain'], undefined);
  });

  await t.test('5. Graceful Fallback on Missing Calibration (allowDefaults: true)', async () => {
    const issue = 'missing_calibration_test';
    await insertOrgVote('agent_uncalibrated_1', issue, 'choice_Z');
    await insertOrgVote('agent_uncalibrated_2', issue, 'choice_Z');

    // Without calibrationScores provided, defaults to neutral Brier 0.25 (weight 0.5625) without error
    const res = await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 2,
      threshold: 0.5,
      calibrationScores: {}
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.quorumReached, true);
    assert.strictEqual(res.decision, 'choice_Z');
    assert.strictEqual(res.weightedTally.choice_Z > 1.0, true);
  });

  await t.test('6. Consensus Resolution Message Persistence', async () => {
    const issue = 'persistence_test';
    await insertOrgVote('agent_p_res', issue, 'final_decision');

    await weightedQuorum({
      orchestratorId,
      issue,
      minVotes: 1,
      threshold: 0.5,
      calibrationScores: { agent_p_res: 0.0 }
    });

    const resolutionMsg = await db.get(
      `SELECT * FROM agent_organization_messages 
       WHERE orchestrator_id = ? AND kind = 'consensus_resolution' 
       ORDER BY id DESC LIMIT 1`,
      orchestratorId
    );
    assert.ok(resolutionMsg);
    const parsedPayload = JSON.parse(resolutionMsg.payload_json);
    assert.strictEqual(parsedPayload.issue, issue);
    assert.strictEqual(parsedPayload.decision, 'final_decision');
    assert.strictEqual(parsedPayload.quorumReached, true);
  });

  await t.test('7. SwarmController Weighted Proposal & Vote Casting', async () => {
    const ws = await db.get('SELECT id FROM workspaces LIMIT 1');
    const wsId = ws ? ws.id : 'ws-local';

    // 1. Create a brier_weighted proposal
    let proposalData = null;
    const mockReqProp = {
      body: {
        title: 'Weighted Quorum Migration',
        description: 'Test brier weighted governance',
        quorumThreshold: 0.6,
        workspaceId: wsId,
        consensusType: 'brier_weighted'
      }
    };
    const mockResProp = {
      status(code) { this.statusCode = code; return this; },
      json(data) { proposalData = data; return this; }
    };

    await swarmController.createProposal(mockReqProp, mockResProp);
    assert.ok(proposalData);
    assert.strictEqual(proposalData.success, true);
    const proposalId = proposalData.proposalId;
    assert.strictEqual(proposalData.consensusType, 'brier_weighted');

    // 2. Cast weighted vote from expert agent (Brier 0.1 => weight 0.81)
    let vote1Data = null;
    const mockReqVote1 = {
      body: {
        proposalId,
        agentId: 'agent_expert',
        vote: 'yes',
        brierScore: 0.1
      }
    };
    const mockResVote1 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { vote1Data = data; return this; }
    };
    await swarmController.castVote(mockReqVote1, mockResVote1);
    assert.strictEqual(vote1Data.success, true);
    assert.strictEqual(Math.round(vote1Data.weight * 100) / 100, 0.81);

    // 3. Cast vote from poorly calibrated agent (Brier 0.9 => weight 0.01)
    let vote2Data = null;
    const mockReqVote2 = {
      body: {
        proposalId,
        agentId: 'agent_poor',
        vote: 'no',
        brierScore: 0.9
      }
    };
    const mockResVote2 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { vote2Data = data; return this; }
    };
    await swarmController.castVote(mockReqVote2, mockResVote2);
    assert.strictEqual(vote2Data.success, true);
    assert.strictEqual(Math.round(vote2Data.weight * 100) / 100, 0.01);

    // 4. Evaluate Consensus
    let consensusData = null;
    const mockReqConsensus = {};
    const mockResConsensus = {
      status(code) { this.statusCode = code; return this; },
      json(data) { consensusData = data; return this; }
    };
    await swarmController.getConsensus(mockReqConsensus, mockResConsensus);

    assert.ok(Array.isArray(consensusData.proposals));
    const p = consensusData.proposals.find(x => x.id === proposalId);
    assert.ok(p);
    assert.strictEqual(p.consensusType, 'brier_weighted');
    // Expert's 0.81 outweighs poor's 0.01: approval_rate = 0.81 / 0.82 ~ 99%
    assert.strictEqual(p.approvalRate >= 98, true);
  });
});
