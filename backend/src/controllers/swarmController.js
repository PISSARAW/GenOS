/**
 * GenOS Swarm Consensus & Biomimicry Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');

async function getConsensus(req, res) {
  const db = await getDatabase();
  const proposals = await db.all('SELECT * FROM swarm_proposals ORDER BY created_at DESC');
  const votes = await db.all('SELECT * FROM swarm_votes');

  const formatted = proposals.map(p => {
    const pVotes = votes.filter(v => v.proposal_id === p.id);
    const yesCount = pVotes.filter(v => v.vote === 'yes').length;
    const noCount = pVotes.filter(v => v.vote === 'no').length;
    const totalVotes = pVotes.length;
    const approvalRate = totalVotes > 0 ? Math.round((yesCount / totalVotes) * 100) : 0;

    return {
      id: p.id,
      title: p.title,
      description: p.description,
      status: p.status,
      proposer: p.proposer_name || 'Swarm Leader',
      quorumThreshold: p.quorum_threshold || 0.66,
      yesCount,
      noCount,
      totalVotes,
      approvalRate,
      votes: pVotes.map(v => ({
        agentId: v.agent_id,
        agentName: v.agent_name || v.agent_id,
        vote: v.vote,
        reason: v.reason
      }))
    };
  });

  res.json({
    proposals: formatted,
    quorumState: {
      activeNodes: 6,
      currentConsensus: 'Achieved (Supermajority 83%)',
      biomimicryModel: 'Honeybee Dance & Quorum Sensing'
    }
  });
}

async function createProposal(req, res) {
  const { title, description, quorumThreshold = 0.66, proposerName = 'operator', workspaceId = 'ws-genos-core' } = req.body || {};
  const id = `prop-${Date.now()}`;

  const db = await getDatabase();
  await db.run(
    `INSERT INTO swarm_proposals (id, workspace_id, proposer_agent_id, proposer_name, title, description, status, quorum_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, 'agent_operator', proposerName, title || 'Swarm Proposal', description || '', 'open', quorumThreshold
  );

  telemetry.emitEvent({
    eventType: 'QUORUM_PROPOSAL_CREATED',
    agentId: proposerName,
    action: 'PROPOSE_QUORUM',
    detail: `New swarm consensus proposal created: ${title}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, proposalId: id });
}

async function castVote(req, res) {
  const { proposalId, agentId = 'worker_node', vote = 'yes', reason = '' } = req.body || {};
  const id = `${proposalId}-${agentId}-${Date.now()}`;

  const db = await getDatabase();
  await db.run(
    `INSERT OR REPLACE INTO swarm_votes (id, proposal_id, agent_id, agent_name, vote, reason) VALUES (?, ?, ?, ?, ?, ?)`,
    id, proposalId, agentId, agentId, vote, reason
  );

  telemetry.emitEvent({
    eventType: 'QUORUM_VOTE_CAST',
    agentId,
    action: 'VOTE',
    detail: `Agent '${agentId}' voted '${vote}' on proposal ${proposalId}`,
    severity: 'info'
  });

  res.json({ success: true, message: `Vote '${vote}' recorded for agent '${agentId}'.` });
}

const swarmMetricsService = require('../services/swarmMetricsService');

async function getMetrics(req, res, next) {
  try {
    const db = await getDatabase();
    const events = await db.all('SELECT action as type, event_type as action FROM telemetry_events ORDER BY created_at DESC LIMIT 50');
    const entropyResult = swarmMetricsService.calculateShannonEntropy(events);
    const deadlockResult = swarmMetricsService.detectDeadlocks([]);

    res.json({
      ...entropyResult,
      deadlockSentinel: deadlockResult,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
}

async function getTopology(req, res, next) {
  try {
    const db = await getDatabase();
    const agents = await db.all('SELECT id, role, status, model_tier as tier FROM agents');
    const topology = swarmMetricsService.getSwarmTopology(agents);
    res.json(topology);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConsensus,
  createProposal,
  castVote,
  getMetrics,
  getTopology
};
