/**
 * GenOS Swarm Consensus & Biomimicry Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const { sanitizeString } = require('../middleware/security');

async function expireOpenProposals(db) {
  await db.run(`
    UPDATE swarm_proposals
    SET status = 'expired'
    WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
  `);
}

async function getConsensus(req, res) {
  const db = await getDatabase();
  await expireOpenProposals(db);
  const proposals = await db.all('SELECT * FROM swarm_proposals ORDER BY created_at DESC');
  const votes = await db.all('SELECT * FROM swarm_votes');
  const activeNodeRow = await db.get("SELECT COUNT(*) AS count FROM agents WHERE status IN ('running', 'Active')");

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

  for (const proposal of formatted) {
    if (proposal.status === 'open' && proposal.totalVotes > 0 && proposal.yesCount / proposal.totalVotes >= proposal.quorumThreshold) {
      proposal.status = 'passed';
      await db.run("UPDATE swarm_proposals SET status = 'passed' WHERE id = ?", proposal.id);
    }
  }

  const latestProposal = formatted[0];
  const currentConsensus = latestProposal
    ? `${latestProposal.approvalRate}% approval · ${latestProposal.totalVotes} vote${latestProposal.totalVotes === 1 ? '' : 's'}`
    : 'No quorum proposal';

  res.json({
    proposals: formatted,
    quorumState: {
      activeNodes: Number(activeNodeRow?.count || 0),
      currentConsensus,
      biomimicryModel: 'Database-backed quorum'
    }
  });
}

async function createProposal(req, res) {
  const { title, description, quorumThreshold = 0.66, workspaceId = 'ws-genos-core' } = req.body || {};
  const safeTitle = sanitizeString(String(title || 'Swarm Proposal')).trim();
  const safeDescription = sanitizeString(String(description || ''));
  const safeProposer = sanitizeString(String(req.user?.username || 'operator')).trim();
  const proposerAgentId = String(req.user?.keyId || safeProposer);
  const threshold = Number(quorumThreshold);
  if (!safeTitle || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return res.status(400).json({ error: { code: 'INVALID_PROPOSAL', message: 'A title and a quorumThreshold in (0, 1] are required.' } });
  }
  const id = `prop-${Date.now()}`;

  const db = await getDatabase();
  await db.run(
    `INSERT INTO swarm_proposals (id, workspace_id, proposer_agent_id, proposer_name, title, description, status, quorum_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, proposerAgentId, safeProposer, safeTitle, safeDescription, 'open', threshold
  );

  telemetry.emitEvent({
    eventType: 'QUORUM_PROPOSAL_CREATED',
    agentId: safeProposer,
    action: 'PROPOSE_QUORUM',
    detail: `New swarm consensus proposal created: ${safeTitle}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, proposalId: id });
}

async function castVote(req, res) {
  const { proposalId, vote = 'yes', reason = '' } = req.body || {};
  const agentId = String(req.user?.keyId || req.user?.username || 'worker_node');
  const agentName = sanitizeString(String(req.user?.username || agentId)).trim();
  const db = await getDatabase();
  await expireOpenProposals(db);
  const proposal = await db.get('SELECT id, status, quorum_threshold FROM swarm_proposals WHERE id = ?', proposalId);
  if (!proposal) {
    return res.status(404).json({ error: { code: 'PROPOSAL_NOT_FOUND', message: 'Swarm proposal was not found.' } });
  }
  if (proposal.status !== 'open') {
    return res.status(409).json({ error: { code: 'PROPOSAL_CLOSED', message: `Swarm proposal is ${proposal.status}.` } });
  }

  const id = `${proposalId}-${agentId}-${Date.now()}`;
  await db.run(
    `INSERT OR REPLACE INTO swarm_votes (id, proposal_id, agent_id, agent_name, vote, reason) VALUES (?, ?, ?, ?, ?, ?)`,
    id, proposalId, agentId, agentName, vote, reason
  );

  const proposalVotes = await db.all('SELECT vote FROM swarm_votes WHERE proposal_id = ?', proposalId);
  const yesCount = proposalVotes.filter((item) => item.vote === 'yes').length;
  const totalVotes = proposalVotes.length;
  if (proposal && totalVotes > 0 && yesCount / totalVotes >= proposal.quorum_threshold) {
    await db.run("UPDATE swarm_proposals SET status = 'passed' WHERE id = ?", proposalId);
  }

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
    const events = await db.all('SELECT action as type, event_type as action, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 50');
    const entropyResult = swarmMetricsService.calculateShannonEntropy(events);
    const messageQueue = events.map((event) => {
      let payload = {};
      try { payload = JSON.parse(event.payload_json || '{}'); } catch {}
      return {
        sender: payload.sender || event.agent_id || 'unknown',
        recipient: payload.recipient || payload.targetAgentId || 'telemetry',
        hasDiff: Boolean(payload.hasDiff || payload.diff)
      };
    });
    const deadlockResult = swarmMetricsService.detectDeadlocks(messageQueue);

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
    const agents = await db.all(`
      SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
        fleet_id as fleetId, parent_agent_id as parentAgentId
      FROM agents WHERE status != 'terminated'
    `);
    const events = await db.all(`
      SELECT id, agent_id, payload_json, created_at
      FROM telemetry_events ORDER BY created_at DESC LIMIT 100
    `);
    const topology = swarmMetricsService.getSwarmTopology(agents, events);
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
