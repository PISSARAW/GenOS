/**
 * GenOS Swarm Consensus & Biomimicry Controller
 *
 * Thin HTTP layer: request parsing, proposal/vote persistence and tenant
 * scoping stay here. Quorum math lives in ./swarmQuorum, proposal views and
 * status transitions in ./swarmTally. Shared defaults come from the quorum
 * policy module (DEFAULT_THRESHOLD = 0.5, participation floor of
 * max(2, ceil(active * 0.5)), abstentions excluded from approval totals).
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');
const telemetry = require('../services/telemetryObserver');
const { sanitizeString } = require('../middleware/security');
const qp = require('../services/primitiveHandlers/quorumPolicy');
const swarmQuorum = require('./swarmQuorum');
const swarmTally = require('./swarmTally');
const swarmVoteInput = require('./swarmVoteInput');
const swarmProposals = require('./swarmProposals');
const swarmMetricsService = require('../services/swarmMetricsService');

const SQL_ACTIVE_BY_WS = "SELECT COUNT(*) AS count FROM agents WHERE workspace_id = ? AND status IN ('running', 'Active', 'idle', 'ready')";
const SQL_ACTIVE_BY_TENANT = "SELECT COUNT(*) AS count FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE w.organization_id = ? AND w.project_id = ? AND a.status IN ('running', 'Active', 'idle', 'ready')";
const SQL_ACTIVE_GLOBAL = "SELECT COUNT(*) AS count FROM agents WHERE status IN ('running', 'Active', 'idle', 'ready')";
const SQL_CALIB_TENANT = 'SELECT AVG(brier_score) AS averageBrier FROM evaluation_runs WHERE agent_id = ? AND brier_score IS NOT NULL AND organization_id = ? AND project_id = ?';
const SQL_CALIB_GLOBAL = 'SELECT AVG(brier_score) AS averageBrier FROM evaluation_runs WHERE agent_id = ? AND brier_score IS NOT NULL';

function tenantOf(req) {
  if (req.tenant !== undefined && req.tenant !== null) return req.tenant;
  return null;
}

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

function activeCountOfRow(row) {
  if (row === null || row === undefined) return 0;
  return qp.countOf(row.count);
}

async function getActiveNodeCount(db, workspaceId, tenant) {
  if (workspaceId) {
    const scoped = await db.get(SQL_ACTIVE_BY_WS, workspaceId);
    if (activeCountOfRow(scoped) > 0) return activeCountOfRow(scoped);
  }
  if (tenant) {
    const tenantRow = await db.get(SQL_ACTIVE_BY_TENANT, tenant.organizationId, tenant.projectId);
    return activeCountOfRow(tenantRow);
  }
  const globalRow = await db.get(SQL_ACTIVE_GLOBAL);
  return activeCountOfRow(globalRow);
}

function hasReachedQuorum(...args) {
  return swarmQuorum.quorumMetFromArgs(args);
}

function hasBeenRejected(...args) {
  return swarmQuorum.rejectedFromArgs(args);
}

async function fetchConsensusProposals(db, tenant) {
  if (tenant) {
    return db.all(`
      SELECT p.* FROM swarm_proposals p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.organization_id = ? AND w.project_id = ?
      ORDER BY p.created_at DESC
    `, tenant.organizationId, tenant.projectId);
  }
  return db.all('SELECT * FROM swarm_proposals ORDER BY created_at DESC');
}

async function fetchConsensusVotes(db, tenant) {
  if (tenant) {
    return db.all(`
      SELECT v.* FROM swarm_votes v
      JOIN swarm_proposals p ON p.id = v.proposal_id
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE w.organization_id = ? AND w.project_id = ?
    `, tenant.organizationId, tenant.projectId);
  }
  return db.all('SELECT * FROM swarm_votes');
}

async function refreshOpenProposals(db, formatted, activeCount) {
  const changes = [];
  for (const proposal of formatted) {
    if (proposal.status === 'open') {
      const change = await swarmTally.refreshProposalStatus({ db, view: proposal, activeCount });
      if (change !== null) changes.push(change);
    }
  }
  return changes;
}

async function getConsensus(req, res) {
  const db = await getDatabase();
  const tenant = tenantOf(req);
  await expireOpenProposals(db, tenant);
  const proposals = await fetchConsensusProposals(db, tenant);
  const votes = await fetchConsensusVotes(db, tenant);
  const globalActiveCount = await getActiveNodeCount(db, null, tenant);
  const formatted = swarmTally.buildViews({ proposals, votes });
  await refreshOpenProposals(db, formatted, globalActiveCount);
  const currentConsensus = swarmTally.summarizeConsensus(formatted);
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
  const body = req.body || {};
  const user = req.user || {};
  const input = swarmProposals.proposalInputOf(body, user);
  if (input.error) {
    return res.status(400).json({ error: { code: 'INVALID_PROPOSAL', message: 'A title and a quorumThreshold in (0, 1] are required.' } });
  }

  const expiresAt = swarmProposals.resolveProposalExpiry(body);
  const id = `prop-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const db = await getDatabase();
  const tenant = tenantOf(req);
  const workspaceId = body.workspaceId || 'ws-genos-core';
  const workspace = await swarmProposals.fetchWorkspaceForProposal(db, tenant, workspaceId);
  if (!workspace) {
    return res.status(404).json({ error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace was not found in the current scope.' } });
  }
  await db.run(
    `INSERT INTO swarm_proposals (id, workspace_id, proposer_agent_id, proposer_name, title, description, status, quorum_threshold, consensus_type, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, workspaceId, input.agentId, input.name, input.title, input.description, 'open', input.threshold, input.consensusType, expiresAt
  );

  telemetry.emitEvent({
    eventType: 'QUORUM_PROPOSAL_CREATED',
    agentId: input.name,
    action: 'PROPOSE_QUORUM',
    detail: `New swarm consensus proposal created: ${input.title} (${input.consensusType})`,
    severity: 'info'
  });

  res.status(201).json({ success: true, proposalId: id, consensusType: input.consensusType, expiresAt });
}

async function fetchProposalForVote(db, req, proposalId) {
  const tenant = tenantOf(req);
  if (tenant) {
    return db.get(`
      SELECT p.id, p.workspace_id, p.status, p.quorum_threshold, p.consensus_type FROM swarm_proposals p
      JOIN workspaces w ON w.id = p.workspace_id
      WHERE p.id = ? AND w.organization_id = ? AND w.project_id = ?
    `, proposalId, tenant.organizationId, tenant.projectId);
  }
  return db.get('SELECT id, workspace_id, status, quorum_threshold, consensus_type FROM swarm_proposals WHERE id = ?', proposalId);
}

async function checkVoteMembership(pack) {
  const tenant = pack.req.tenant;
  if (!tenant || !pack.agentId) return null;
  const member = await pack.db.get(
    `SELECT a.id FROM agents a JOIN workspaces w ON w.id = a.workspace_id
     WHERE a.id = ? AND a.workspace_id = ? AND w.organization_id = ? AND w.project_id = ?`,
    pack.agentId, pack.proposal.workspace_id, tenant.organizationId, tenant.projectId
  );
  if (!member) return { code: 'VOTE_AGENT_SCOPE_FORBIDDEN', message: 'agentId must belong to the proposal workspace.' };
  return null;
}

async function fetchCalibrationAverage(db, req, agentId) {
  const tenant = tenantOf(req);
  if (tenant) {
    return db.get(SQL_CALIB_TENANT, agentId, tenant.organizationId, tenant.projectId);
  }
  return db.get(SQL_CALIB_GLOBAL, agentId);
}

async function calibrationWeightOf(pack) {
  if (pack.proposal.consensus_type !== 'brier_weighted') return { weight: 1.0, brier: null };
  const row = await fetchCalibrationAverage(pack.db, pack.req, pack.parsed.agentId);
  let average = null;
  if (row !== null && row !== undefined) {
    const raw = row.averageBrier;
    if (raw !== null && raw !== undefined) average = Number(raw);
  }
  if (Number.isFinite(average) && average >= 0 && average <= 1) {
    return { weight: qp.brierScoreToWeight(average), brier: average };
  }
  return { weight: 1.0, brier: null };
}

async function persistSwarmVote(pack) {
  const info = await calibrationWeightOf(pack);
  const id = `${pack.parsed.proposalId}-${pack.parsed.agentId}-${Date.now()}`;
  await pack.db.run(
    `INSERT OR REPLACE INTO swarm_votes (id, proposal_id, agent_id, agent_name, vote, weight, brier_score, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id, pack.parsed.proposalId, pack.parsed.agentId, pack.parsed.agentName, pack.parsed.vote, info.weight, info.brier, pack.parsed.reason
  );
  return info;
}

async function applyVoteOutcome(pack) {
  const proposalVotes = await pack.db.all('SELECT vote, weight FROM swarm_votes WHERE proposal_id = ?', pack.proposal.id);
  const weighted = pack.proposal.consensus_type === 'brier_weighted';
  const tally = qp.tallySwarmVotes({ votes: proposalVotes, weighted });
  const activeCount = await getActiveNodeCount(pack.db, pack.proposal.workspace_id, tenantOf(pack.req));
  let yes = tally.yesCount;
  let no = tally.noCount;
  if (weighted) {
    yes = tally.yesWeight;
    no = tally.noWeight;
  }
  const outcome = qp.resolveProposalStatus({
    yes,
    no,
    participation: tally.participationCount,
    active: activeCount,
    threshold: qp.resolveThreshold(pack.proposal.quorum_threshold)
  });
  if (outcome.status === 'passed') {
    await pack.db.run("UPDATE swarm_proposals SET status = 'passed' WHERE id = ?", pack.proposal.id);
    telemetry.emitEvent({
      eventType: 'QUORUM_PROPOSAL_PASSED',
      agentId: pack.agentId,
      action: 'PASS_QUORUM',
      detail: `Swarm consensus proposal passed: ${pack.proposal.id}`,
      severity: 'info'
    });
  } else if (outcome.status === 'rejected') {
    await pack.db.run("UPDATE swarm_proposals SET status = 'rejected' WHERE id = ?", pack.proposal.id);
    telemetry.emitEvent({
      eventType: 'QUORUM_PROPOSAL_REJECTED',
      agentId: pack.agentId,
      action: 'REJECT_QUORUM',
      detail: `Swarm consensus proposal rejected: ${pack.proposal.id}`,
      severity: 'warn'
    });
  }
  return outcome;
}

async function castVote(req, res) {
  const parsed = swarmVoteInput.parseVoteBody(req);
  if (parsed.error === 'INVALID_FIELD_NAMING') {
    return res.status(400).json({ error: { code: 'INVALID_FIELD_NAMING', message: 'Swarm vote requests require agentId and agentName in camelCase.' } });
  }
  if (parsed.error) {
    return res.status(400).json({ error: { code: 'INVALID_VOTE', message: 'proposalId and a vote of yes, no, or abstain are required.' } });
  }
  const db = await getDatabase();
  await expireOpenProposals(db, tenantOf(req));
  const proposal = await fetchProposalForVote(db, req, parsed.proposalId);
  if (!proposal) {
    return res.status(404).json({ error: { code: 'PROPOSAL_NOT_FOUND', message: 'Swarm proposal was not found.' } });
  }
  if (proposal.status !== 'open') {
    return res.status(409).json({ error: { code: 'PROPOSAL_CLOSED', message: `Swarm proposal is ${proposal.status}.` } });
  }
  const forbidden = swarmVoteInput.authorizeVoter({ req, requested: parsed.requested, agentId: parsed.agentId });
  if (forbidden) {
    return res.status(403).json({ error: forbidden });
  }
  const scoped = await checkVoteMembership({ db, req, proposal, agentId: parsed.agentId });
  if (scoped) {
    return res.status(403).json({ error: scoped });
  }
  const existingVote = await db.get('SELECT id FROM swarm_votes WHERE proposal_id = ? AND agent_id = ?', parsed.proposalId, parsed.agentId);
  if (existingVote) {
    return res.status(409).json({ error: { code: 'VOTE_ALREADY_CAST', message: 'This participant has already voted on the proposal.' } });
  }
  const stored = await persistSwarmVote({ db, req, proposal, parsed });
  await applyVoteOutcome({ db, req, proposal, agentId: parsed.agentId });

  telemetry.emitEvent({
    eventType: 'QUORUM_VOTE_CAST',
    agentId: parsed.agentId,
    action: 'VOTE',
    detail: `Agent '${parsed.agentId}' voted '${parsed.vote}' (weight: ${stored.weight}) on proposal ${parsed.proposalId}`,
    severity: 'info'
  });

  res.json({ success: true, message: `Vote '${parsed.vote}' recorded for agent '${parsed.agentId}'.`, weight: stored.weight });
}

function safePayloadOf(event) {
  try {
    return JSON.parse(event.payload_json || '{}');
  } catch (_) {
    return {};
  }
}

function hasDiffOf(payload) {
  if (payload.hasDiff || payload.diff) return true;
  return false;
}

function collectMessageQueue(events) {
  const queue = [];
  for (const event of events) {
    const payload = safePayloadOf(event);
    const sender = payload.sender || event.agent_id;
    const recipient = payload.recipient || payload.targetAgentId;
    if (sender && recipient && recipient !== 'telemetry' && recipient !== 'system' && sender !== recipient) {
      queue.push({ sender, recipient, hasDiff: hasDiffOf(payload) });
    }
  }
  return queue;
}

async function getMetrics(req, res, next) {
  try {
    const db = await getDatabase();
    const tenant = tenantOf(req);
    let events = [];
    if (tenant) {
      events = await db.all(`SELECT action as type, event_type as action, agent_id, payload_json, created_at
          FROM telemetry_events WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 50`, tenant.organizationId, tenant.projectId);
    } else {
      events = await db.all('SELECT action as type, event_type as action, agent_id, payload_json, created_at FROM telemetry_events ORDER BY created_at DESC LIMIT 50');
    }
    const chronologicalEvents = events.slice().reverse();
    const entropyResult = swarmMetricsService.calculateShannonEntropy(chronologicalEvents);
    const messageQueue = collectMessageQueue(events);
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
    const tenant = tenantOf(req);
    let agents = [];
    let events = [];
    if (tenant) {
      agents = await db.all(`
      SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
        fleet_id as fleetId, parent_agent_id as parentAgentId
      FROM agents a JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.status != 'terminated' AND w.organization_id = ? AND w.project_id = ?
    `, tenant.organizationId, tenant.projectId);
      events = await db.all(`
      SELECT id, agent_id, payload_json, created_at FROM telemetry_events
      WHERE organization_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 100
    `, tenant.organizationId, tenant.projectId);
    } else {
      agents = await db.all(`
      SELECT id, name, role, status, model_tier as tier, workspace_id as workspaceId,
        fleet_id as fleetId, parent_agent_id as parentAgentId
      FROM agents WHERE status != 'terminated'
    `);
      events = await db.all(`
      SELECT id, agent_id, payload_json, created_at
      FROM telemetry_events ORDER BY created_at DESC LIMIT 100
    `);
    }
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
