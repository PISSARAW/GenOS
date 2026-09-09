/**
 * GenOS Swarm Consensus & Biomimicry Controller
 */

const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const { sanitizeString } = require('../middleware/security');

async function expireOpenProposals(db, tenant = null) {
  if (tenant) {
    await db.run(`
      UPDATE swarm_proposals
      SET status = 'expired'
      WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP
        AND workspace_id IN (SELECT id FROM workspaces WHERE organization_id = ? AND project_id = ?)
    `, tenant.organizationId, tenant.projectId);
    return;
  }
  await db.run(`UPDATE swarm_proposals SET status = 'expired' WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`);
}

async function getActiveNodeCount(db, workspaceId, tenant) {
  if (workspaceId) {
    const row = await db.get(
      "SELECT COUNT(*) AS count FROM agents WHERE workspace_id = ? AND status IN ('running', 'Active', 'idle', 'ready')",
      workspaceId
    );
    if (row && row.count > 0) return Number(row.count);
  }
  if (tenant) {
    const row = await db.get(`
      SELECT COUNT(*) AS count FROM agents a
      JOIN workspaces w ON w.id = a.workspace_id
      WHERE w.organization_id = ? AND w.project_id = ?
        AND a.status IN ('running', 'Active', 'idle', 'ready')
    `, tenant.organizationId, tenant.projectId);
    return Number(row?.count || 0);
  }
  const row = await db.get("SELECT COUNT(*) AS count FROM agents WHERE status IN ('running', 'Active', 'idle', 'ready')");
  return Number(row?.count || 0);
}

function hasReachedQuorum({yesCount, noCount, totalVotes, activeNodeCount, approvalThreshold}) {
  const participationThreshold = 0.5; // Require at least 50% participation
  const requiredVotes = Math.max(1, Math.ceil(activeNodeCount * participationThreshold));
  const validVotes = yesCount + noCount;
  return totalVotes >= requiredVotes && validVotes > 0 && (yesCount / validVotes) >= approvalThreshold;
}

function hasBeenRejected({yesCount, noCount, totalVotes, activeNodeCount, approvalThreshold}) {
  const remainingVotes = Math.max(0, activeNodeCount - totalVotes);
  const maxPossibleYes = yesCount + remainingVotes;
  const maxPossibleValid = (yesCount + noCount) + remainingVotes;
  return maxPossibleValid > 0 && (maxPossibleYes / maxPossibleValid) < approvalThreshold;
}

function formatProposal(proposal, pVotes, isWeighted) {
  let yesCount = 0;
  let noCount = 0;
  let abstainCount = 0;

  for (const v of pVotes) {
    if (v.vote === 'yes') yesCount++;
    else if (v.vote === 'no') noCount++;
    else if (v.vote === 'abstain') abstainCount++;
  }

  const totalVotes = pVotes.length;
  const validVotes = yesCount + noCount;
  const approvalRate = validVotes > 0 ? Math.round((yesCount / validVotes) * 100) : 0;

  return {
    id: proposal.id,
    workspaceId: proposal.workspace_id,
    title: proposal.title,
    description: proposal.description,
    status: proposal.status,
    consensusType: proposal.consensus_type || 'simple',
    proposer: proposal.proposer_name || 'Swarm Leader',
    quorumThreshold: proposal.quorum_threshold || 0.66,
    yesCount,
    noCount,
    abstainCount,
    yesWeight: 0,
    noWeight: 0,
    totalVotes,
    approvalRate,
    votes: pVotes.map(v => ({
      agentId: v.agent_id,
      agentName: v.agent_name || v.agent_id,
      vote: v.vote,
      weight: 1.0,
      brierScore: v.brier_score,
      reason: v.reason
    }))
  };
}

async function getConsensus(req, res) {
  const db = await getDatabase();
  await expireOpenProposals(db, req.tenant);
  const proposals = req.tenant
    ? await db.all(`
      SELECT p.* FROM swarm_proposals p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.organization_id = ? AND w.project_id = ?
      ORDER BY p.created_at DESC
    `, req.tenant.organizationId, req.tenant.projectId)
    : await db.all('SELECT * FROM swarm_proposals ORDER BY created_at DESC');
  const votes = req.tenant
    ? await db.all(`
      SELECT v.* FROM swarm_votes v
      JOIN swarm_proposals p ON p.id = v.proposal_id
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.organization_id = ? AND w.project_id = ?
    `, req.tenant.organizationId, req.tenant.projectId)
    : await db.all('SELECT * FROM swarm_votes');
  const globalActiveCount = await getActiveNodeCount(db, null, req.tenant);
  const votesByProposal = new Map();
  for (const vote of votes) {
    const proposalVotes = votesByProposal.get(vote.proposal_id) || [];
    proposalVotes.push(vote);
    votesByProposal.set(vote.proposal_id, proposalVotes);
  }

  const formatted = proposals.map(p => {
    const pVotes = votesByProposal.get(p.id) || [];
    const isWeighted = p.consensus_type === 'brier_weighted';
    let yesWeight = 0;
    let noWeight = 0;
    let totalWeight = 0;
    let yesCount = 0;
    let noCount = 0;
    let abstainCount = 0;

    for (const v of pVotes) {
      const w = Number.isFinite(v.weight) && v.weight > 0 ? Number(v.weight) : 1.0;
      if (v.vote === 'yes') {
        yesCount++;
        yesWeight += w;
      } else if (v.vote === 'no') {
        noCount++;
        noWeight += w;
      } else if (v.vote === 'abstain') {
        abstainCount++;
      }
      totalWeight += w;
    }

    const totalVotes = pVotes.length;
    const validVotes = yesCount + noCount;
    const validWeight = yesWeight + noWeight;
    const approvalRate = isWeighted
      ? (validWeight > 0 ? Math.round((yesWeight / validWeight) * 100) : 0)
      : (validVotes > 0 ? Math.round((yesCount / validVotes) * 100) : 0);

    return {
      id: p.id,
      workspaceId: p.workspace_id,
      title: p.title,
      description: p.description,
      status: p.status,
      consensusType: p.consensus_type || 'simple',
      proposer: p.proposer_name || 'Swarm Leader',
      quorumThreshold: p.quorum_threshold || 0.66,
      yesCount,
      noCount,
      abstainCount,
      yesWeight,
      noWeight,
      totalVotes,
      approvalRate,
      votes: pVotes.map(v => ({
        agentId: v.agent_id,
        agentName: v.agent_name || v.agent_id,
        vote: v.vote,
        weight: v.weight ?? 1.0,
        brierScore: v.brier_score,
        reason: v.reason
      }))
    };
  });

  for (const proposal of formatted) {
    if (proposal.status === 'open') {
      const isWeighted = proposal.consensusType === 'brier_weighted';
      const yesVal = isWeighted ? proposal.yesWeight : proposal.yesCount;
      const noVal = isWeighted ? proposal.noWeight : proposal.noCount;
      const totalVal = isWeighted ? (proposal.yesWeight + proposal.noWeight) : proposal.totalVotes;

      if (hasReachedQuorum(
        yesVal,
        noVal,
        totalVal,
        globalActiveCount,
        proposal.quorumThreshold
      )) {
        proposal.status = 'passed';
        await db.run("UPDATE swarm_proposals SET status = 'passed' WHERE id = ? AND workspace_id = ?", proposal.id, proposal.workspaceId);
      } else if (hasBeenRejected(
        yesVal,
        noVal,
        totalVal,
        globalActiveCount,
        proposal.quorumThreshold
      )) {
        proposal.status = 'rejected';
        await db.run("UPDATE swarm_proposals SET status = 'rejected' WHERE id = ? AND workspace_id = ?", proposal.id, proposal.workspaceId);
      }
    }
  }

  const latestProposal = formatted[0];
  const currentConsensus = latestProposal
    ? `${latestProposal.approvalRate}% approval · ${latestProposal.totalVotes} vote${latestProposal.totalVotes === 1 ? '' : 's'}`
    : 'No quorum proposal';

  res.json({
    proposals: formatted,
    quorumState: {
      activeNodes: globalActiveCount,
      currentConsensus,
      biomimicryModel: 'Database-backed quorum'
    }
  });
}

async function createProposal(req, res) {
  const { title, description, quorumThreshold = 0.66, workspaceId = 'ws-genos-core', consensusType = 'simple', expiresAt: inputExpiresAt, ttlHours } = req.body || {};
  const safeTitle = sanitizeString(String(title || 'Swarm Proposal')).trim();
  const safeDescription = sanitizeString(String(description || ''));
  const safeProposer = sanitizeString(String(req.user?.username || 'operator')).trim();
  const proposerAgentId = String(req.user?.keyId || safeProposer);
  const threshold = Number(quorumThreshold);
  const safeConsensusType = ['simple', 'brier_weighted'].includes(consensusType) ? consensusType : 'simple';

  if (!safeTitle || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    return res.status(400).json({ error: { code: 'INVALID_PROPOSAL', message: 'A title and a quorumThreshold in (0, 1] are required.' } });
  }

  let expiresAt = null;
  if (inputExpiresAt) {
    const parsed = new Date(inputExpiresAt);
    if (!isNaN(parsed.getTime())) expiresAt = parsed.toISOString();
  } else if (Number.isFinite(Number(ttlHours)) && Number(ttlHours) > 0) {
    expiresAt = new Date(Date.now() + Number(ttlHours) * 3600000).toISOString();
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
    `INSERT INTO swarm_proposals (id, workspace_id, proposer_agent_id, proposer_name, title, description, status, quorum_threshold, consensus_type, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, proposerAgentId, safeProposer, safeTitle, safeDescription, 'open', threshold, safeConsensusType, expiresAt
  );

  telemetry.emitEvent({
    eventType: 'QUORUM_PROPOSAL_CREATED',
    agentId: safeProposer,
    action: 'PROPOSE_QUORUM',
    detail: `New swarm consensus proposal created: ${safeTitle} (${safeConsensusType})${expiresAt ? ` [expires: ${expiresAt}]` : ''}`,
    severity: 'info'
  });

  res.status(201).json({ success: true, proposalId: id, consensusType: safeConsensusType, expiresAt });
}

async function castVote(req, res) {
  const { proposalId, vote = 'yes', reason = '', weight: inputWeight, brierScore } = req.body || {};
  const safeProposalId = sanitizeString(String(proposalId || '')).trim();
  const normalizedVote = String(vote).trim().toLowerCase();
  const safeReason = sanitizeString(String(reason || '')).trim();
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'agent_id') || Object.prototype.hasOwnProperty.call(req.body || {}, 'agent_name')) {
    return res.status(400).json({ error: { code: 'INVALID_FIELD_NAMING', message: 'Swarm vote requests require agentId and agentName in camelCase.' } });
  }
  const rawAgentId = req.body?.agentId || req.user?.keyId || req.user?.username;
  const agentId = sanitizeString(String(rawAgentId || `worker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)).trim();
  const rawAgentName = req.body?.agentName || req.user?.username || agentId;
  const agentName = sanitizeString(String(rawAgentName)).trim();
  if (!safeProposalId || !['yes', 'no', 'abstain'].includes(normalizedVote)) {
    return res.status(400).json({ error: { code: 'INVALID_VOTE', message: 'proposalId and a vote of yes, no, or abstain are required.' } });
  }
  const db = await getDatabase();
  await expireOpenProposals(db, req.tenant);
  const proposal = req.tenant
    ? await db.get(`
      SELECT p.id, p.workspace_id, p.status, p.quorum_threshold, p.consensus_type FROM swarm_proposals p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND w.organization_id = ? AND w.project_id = ?
    `, safeProposalId, req.tenant.organizationId, req.tenant.projectId)
    : await db.get('SELECT id, workspace_id, status, quorum_threshold, consensus_type FROM swarm_proposals WHERE id = ?', safeProposalId);
  if (!proposal) {
    return res.status(404).json({ error: { code: 'PROPOSAL_NOT_FOUND', message: 'Swarm proposal was not found.' } });
  }
  if (proposal.status !== 'open') {
    return res.status(409).json({ error: { code: 'PROPOSAL_CLOSED', message: `Swarm proposal is ${proposal.status}.` } });
  }

  const requestedAgentId = req.body?.agentId;
  const authenticatedId = req.user?.keyId || req.user?.username;
  const canImpersonate = req.user?.role === 'admin' || req.user?.permissions?.includes('all');
  if (requestedAgentId && authenticatedId && requestedAgentId !== authenticatedId && !canImpersonate) {
    return res.status(403).json({ error: { code: 'VOTE_AGENT_FORBIDDEN', message: 'agentId must match the authenticated participant.' } });
  }
  if (req.tenant && agentId) {
    const member = await db.get(
      `SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.id = ? AND a.workspace_id = ? AND w.organization_id = ? AND w.project_id = ?`,
      agentId, proposal.workspace_id, req.tenant.organizationId, req.tenant.projectId
    );
    if (!member) return res.status(403).json({ error: { code: 'VOTE_AGENT_SCOPE_FORBIDDEN', message: 'agentId must belong to the proposal workspace.' } });
  }

  const existingVote = await db.get('SELECT id FROM swarm_votes WHERE proposal_id = ? AND agent_id = ?', safeProposalId, agentId);
  if (existingVote) {
    return res.status(409).json({ error: { code: 'VOTE_ALREADY_CAST', message: 'This participant has already voted on the proposal.' } });
  }

  // Compute vote weight from persisted calibration; client-supplied weight is not authoritative.
  let voteWeight = 1.0;
  let recordedBrier = null;
  if (proposal.consensus_type === 'brier_weighted') {
    const calibration = req.tenant
      ? await db.get(
        `SELECT AVG(brier_score) AS averageBrier FROM evaluation_runs
         WHERE agent_id = ? AND brier_score IS NOT NULL AND organization_id = ? AND project_id = ?`,
        agentId, req.tenant.organizationId, req.tenant.projectId
      )
      : await db.get('SELECT AVG(brier_score) AS averageBrier FROM evaluation_runs WHERE agent_id = ? AND brier_score IS NOT NULL', agentId);
    if (Number.isFinite(Number(calibration?.averageBrier)) && Number(calibration.averageBrier) >= 0 && Number(calibration.averageBrier) <= 1) {
      recordedBrier = Number(calibration.averageBrier);
    }
  }
  if (recordedBrier !== null) {
    voteWeight = recordedBrier >= 0.5 ? Math.max(0, 0.1 * (1 - recordedBrier)) : Math.pow(1 - recordedBrier, 2);
  }

  const id = `${safeProposalId}-${agentId}-${Date.now()}`;
  await db.run(
    `INSERT OR REPLACE INTO swarm_votes (id, proposal_id, agent_id, agent_name, vote, weight, brier_score, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, safeProposalId, agentId, agentName, normalizedVote, voteWeight, recordedBrier, safeReason
  );

  const proposalVotes = await db.all('SELECT vote, weight FROM swarm_votes WHERE proposal_id = ?', safeProposalId);
  const isWeighted = proposal.consensus_type === 'brier_weighted';
  let yesVal = 0;
  let noVal = 0;
  let totalVal = 0;

  for (const v of proposalVotes) {
    const w = isWeighted ? (Number.isFinite(v.weight) && v.weight > 0 ? Number(v.weight) : 1.0) : 1;
    if (v.vote === 'yes') yesVal += w;
    else if (v.vote === 'no') noVal += w;
    totalVal += (isWeighted ? w : 1);
  }

  const activeCount = await getActiveNodeCount(db, proposal.workspace_id, req.tenant);

  if (hasReachedQuorum(yesVal, noVal, totalVal, activeCount, proposal.quorum_threshold)) {
    await db.run("UPDATE swarm_proposals SET status = 'passed' WHERE id = ?", safeProposalId);
    telemetry.emitEvent({
      eventType: 'QUORUM_PROPOSAL_PASSED',
      agentId,
      action: 'PASS_QUORUM',
      detail: `Swarm consensus proposal passed: ${safeProposalId}`,
      severity: 'info'
    });
  } else if (hasBeenRejected(yesVal, noVal, totalVal, activeCount, proposal.quorum_threshold)) {
    await db.run("UPDATE swarm_proposals SET status = 'rejected' WHERE id = ?", safeProposalId);
    telemetry.emitEvent({
      eventType: 'QUORUM_PROPOSAL_REJECTED',
      agentId,
      action: 'REJECT_QUORUM',
      detail: `Swarm consensus proposal rejected: ${safeProposalId}`,
      severity: 'warn'
    });
  }

  telemetry.emitEvent({
    eventType: 'QUORUM_VOTE_CAST',
    agentId,
    action: 'VOTE',
    detail: `Agent '${agentId}' voted '${normalizedVote}' (weight: ${voteWeight}) on proposal ${safeProposalId}`,
    severity: 'info'
  });

  res.json({ success: true, message: `Vote '${normalizedVote}' recorded for agent '${agentId}'.`, weight: voteWeight });
}

const swarmMetricsService = require('../services/swarmMetricsService');

async function getMetrics(req, res, next) {
  try {
    const db = await getDatabase();
    const events = req.tenant
      ? await db.all(`SELECT action as type, event_type as action, agent_id, payload_json, created_at
          FROM telemetry_events WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50`, req.tenant.organizationId, req.tenant.projectId)
      : await db.all('SELECT action as type, event_type as action, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 50');
    const chronologicalEvents = [...events].reverse();
    const entropyResult = swarmMetricsService.calculateShannonEntropy(chronologicalEvents);
    const messageQueue = [];
    for (const event of events) {
      let payload = {};
      try { payload = JSON.parse(event.payload_json || '{}'); } catch {}
      const sender = payload.sender || event.agent_id;
      const recipient = payload.recipient || payload.targetAgentId;
      if (sender && recipient && recipient !== 'telemetry' && recipient !== 'system' && sender !== recipient) {
        messageQueue.push({
          sender,
          recipient,
          hasDiff: Boolean(payload.hasDiff || payload.diff)
        });
      }
    }
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
    const agents = req.tenant ? await db.all(`
      SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
        fleet_id as fleetId, parent_agent_id as parentAgentId
      FROM agents a JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.status != 'terminated' AND w.organization_id = ? AND w.project_id = ?
    `, req.tenant.organizationId, req.tenant.projectId) : await db.all(`
      SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
        fleet_id as fleetId, parent_agent_id as parentAgentId
      FROM agents WHERE status != 'terminated'
    `);
    const events = req.tenant ? await db.all(`
      SELECT id, agent_id, payload_json, created_at FROM telemetry_events
      WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100
    `, req.tenant.organizationId, req.tenant.projectId) : await db.all(`
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
  getTopology,
  getActiveNodeCount,
  hasReachedQuorum,
  hasBeenRejected
};
