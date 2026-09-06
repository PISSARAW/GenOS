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

function hasReachedQuorum(yesCount, totalVotes, activeNodeCount, threshold) {
  const requiredVotes = Math.max(1, Math.ceil(activeNodeCount * threshold));
  return totalVotes >= requiredVotes && yesCount / totalVotes >= threshold;
}

async function getConsensus(req, res) {
  const db = await getDatabase();
  await expireOpenProposals(db);
  const proposals = req.tenant
    ? await db.all(`
      SELECT p.* FROM swarm_proposals p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.organization_id = ? AND w.project_id = ?
      ORDER BY p.created_at DESC
    `, req.tenant.organizationId, req.tenant.projectId)
    : await db.all('SELECT * FROM swarm_proposals ORDER BY created_at DESC');
  const votes = await db.all('SELECT * FROM swarm_votes');
  const activeNodeRow = await db.get("SELECT COUNT(*) AS count FROM agents WHERE status IN ('running', 'Active')");
  const votesByProposal = new Map();
  for (const vote of votes) {
    const proposalVotes = votesByProposal.get(vote.proposal_id) || [];
    proposalVotes.push(vote);
    votesByProposal.set(vote.proposal_id, proposalVotes);
  }

  const formatted = proposals.map(p => {
    const pVotes = votesByProposal.get(p.id) || [];
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
    if (proposal.status === 'open' && hasReachedQuorum(
      proposal.yesCount,
      proposal.totalVotes,
      Number(activeNodeRow?.count || 0),
      proposal.quorumThreshold
    )) {
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
  const workspace = req.tenant
    ? await db.get('SELECT id FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspaceId, req.tenant.organizationId, req.tenant.projectId)
    : await db.get('SELECT id FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace was not found in the current scope.' } });
  }
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
  const safeProposalId = sanitizeString(String(proposalId || '')).trim();
  const normalizedVote = String(vote).trim().toLowerCase();
  const safeReason = sanitizeString(String(reason || '')).trim();
  const agentId = String(req.user?.keyId || req.user?.username || 'worker_node');
  const agentName = sanitizeString(String(req.user?.username || agentId)).trim();
  if (!safeProposalId || !['yes', 'no', 'abstain'].includes(normalizedVote)) {
    return res.status(400).json({ error: { code: 'INVALID_VOTE', message: 'proposalId and a vote of yes, no, or abstain are required.' } });
  }
  const db = await getDatabase();
  await expireOpenProposals(db);
  const proposal = req.tenant
    ? await db.get(`
      SELECT p.id, p.status, p.quorum_threshold FROM swarm_proposals p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND w.organization_id = ? AND w.project_id = ?
    `, safeProposalId, req.tenant.organizationId, req.tenant.projectId)
    : await db.get('SELECT id, status, quorum_threshold FROM swarm_proposals WHERE id = ?', safeProposalId);
  if (!proposal) {
    return res.status(404).json({ error: { code: 'PROPOSAL_NOT_FOUND', message: 'Swarm proposal was not found.' } });
  }
  if (proposal.status !== 'open') {
    return res.status(409).json({ error: { code: 'PROPOSAL_CLOSED', message: `Swarm proposal is ${proposal.status}.` } });
  }

  const existingVote = await db.get('SELECT id FROM swarm_votes WHERE proposal_id = ? AND agent_id = ?', safeProposalId, agentId);
  if (existingVote) {
    return res.status(409).json({ error: { code: 'VOTE_ALREADY_CAST', message: 'This participant has already voted on the proposal.' } });
  }

  const id = `${safeProposalId}-${agentId}-${Date.now()}`;
  await db.run(
    `INSERT OR REPLACE INTO swarm_votes (id, proposal_id, agent_id, agent_name, vote, reason) VALUES (?, ?, ?, ?, ?, ?)`,
    id, safeProposalId, agentId, agentName, normalizedVote, safeReason
  );

  const proposalVotes = await db.all('SELECT vote FROM swarm_votes WHERE proposal_id = ?', safeProposalId);
  const yesCount = proposalVotes.filter((item) => item.vote === 'yes').length;
  const totalVotes = proposalVotes.length;
  const activeNodeRow = await db.get("SELECT COUNT(*) AS count FROM agents WHERE status IN ('running', 'Active')");
  if (hasReachedQuorum(yesCount, totalVotes, Number(activeNodeRow?.count || 0), proposal.quorum_threshold)) {
    await db.run("UPDATE swarm_proposals SET status = 'passed' WHERE id = ?", safeProposalId);
  }

  telemetry.emitEvent({
    eventType: 'QUORUM_VOTE_CAST',
    agentId,
    action: 'VOTE',
    detail: `Agent '${agentId}' voted '${normalizedVote}' on proposal ${safeProposalId}`,
    severity: 'info'
  });

  res.json({ success: true, message: `Vote '${normalizedVote}' recorded for agent '${agentId}'.` });
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
