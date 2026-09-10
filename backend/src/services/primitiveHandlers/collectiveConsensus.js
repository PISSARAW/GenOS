/**
 * Lot 5 primitives: swarm consensus and quorum (brier_scores, quorum, weighted_quorum).
 * Policy (threshold 0.5, EPSILON 1e-9, participation floor, continuous Brier
 * weights, 'tied') lives in ./quorumPolicy; this module wires storage to it.
 */
const telemetry = require('../telemetryObserver');
const { getDatabase } = require('../../db');
const qp = require('./quorumPolicy');

const SQL_ORG_VOTES = `SELECT sender_agent_id, payload_json FROM agent_organization_messages WHERE orchestrator_id = ? AND kind = 'vote' AND (json_extract(payload_json, '$.issue') = ? OR json_extract(payload_json, '$.issue') IS NULL) ORDER BY id DESC`;
const SQL_FIND_PROPOSAL = 'SELECT id FROM swarm_proposals WHERE id = ? OR title = ? ORDER BY created_at DESC LIMIT 1';
const SQL_SWARM_VOTES = 'SELECT agent_id, vote FROM swarm_votes WHERE proposal_id = ?';
const SQL_SWARM_VOTES_WEIGHTED = 'SELECT agent_id, vote, weight, brier_score FROM swarm_votes WHERE proposal_id = ?';
const SQL_CALIB_AVG = 'SELECT AVG(brier_score) as avg_brier FROM evaluation_runs WHERE agent_id = ? AND brier_score IS NOT NULL';
function safeContext(context) {
  if (context !== null && typeof context === 'object') return context;
  return {};
}
function round6(value) {
  return Number(value.toFixed(6));
}

function observationsFor(context, agentId) {
  const all = context.calibrationObservations;
  if (!Array.isArray(all)) return [];
  const out = [];
  for (const item of all) {
    if (item !== null && typeof item === 'object' && item.agentId === agentId) out.push(item);
  }
  return out;
}

function suppliedScoreFor(context, agentId) {
  const table = context.calibrationScores;
  if (table === null || table === undefined) return NaN;
  return Number(table[agentId]);
}

function defaultScoreOf(context) {
  const raw = Number(context.defaultScore);
  if (Number.isFinite(raw)) return raw;
  return 0.25;
}

async function dbFallbackBrier(pack) {
  try {
    const row = await pack.db.get(SQL_CALIB_AVG, pack.agentId);
    if (row === null || row === undefined) return null;
    const raw = row.avg_brier;
    if (raw === null || raw === undefined) return null;
    const average = Number(raw);
    if (Number.isFinite(average) && average >= 0 && average <= 1) return average;
    return null;
  } catch (_) {
    return null;
  }
}

async function scoreOneAgent(pack) {
  const items = observationsFor(pack.context, pack.agentId);
  if (items.length > 0) {
    const mean = qp.meanFiniteBrier(items);
    if (Number.isFinite(mean)) return { ok: true, value: round6(mean) };
  }
  const supplied = suppliedScoreFor(pack.context, pack.agentId);
  if (Number.isFinite(supplied) && supplied >= 0 && supplied <= 1) return { ok: true, value: round6(supplied) };
  const fallback = await dbFallbackBrier(pack);
  if (fallback !== null) return { ok: true, value: round6(fallback) };
  if (pack.context.allowDefaults || pack.context.fallbackDefault) return { ok: true, value: round6(defaultScoreOf(pack.context)) };
  return { ok: false, error: { success: false, error: 'Calibration observations or scores required for every agent.' } };
}

function emitBrierTelemetry(context, scores) {
  telemetry.emitEvent({
    eventType: 'SWARM_BRIER_SCORES',
    agentId: context.orchestratorId || 'strategy_adapter',
    action: 'BRIER_SCORES',
    detail: 'Calculated Brier scores.',
    severity: 'info',
    payload: { scores }
  });
}

async function brierScores(context = {}) {
  const safe = safeContext(context);
  const ids = safe.agentIds;
  if (!Array.isArray(ids) || ids.length === 0) return { success: true, scores: {} };
  const scores = {};
  const db = await getDatabase();
  for (const id of ids) {
    const scored = await scoreOneAgent({ context: safe, db, agentId: id });
    if (scored.ok) scores[id] = scored.value;
    else return scored.error;
  }
  emitBrierTelemetry(safe, scores);
  return { success: true, scores };
}

async function recordConsensusMessage({ db, orchestratorId, kind, issue, decision, quorumReached, data = {} }) {
  if (!db) return;
  try {
    const state = await db.get('SELECT organization, version FROM agent_organization_state WHERE orchestrator_id = ?', orchestratorId) || {};
    await db.run(`INSERT INTO agent_organization_messages (orchestrator_id, organization, organization_version, sender_agent_id, recipient_agent_id, channel, kind, content, payload_json) VALUES (?, ?, ?, ?, NULL, 'consensus', ?, ?, ?)`,
      orchestratorId,
      state.organization || 'collective', state.version || 1,
      orchestratorId,
      kind,
      quorumReached ? `Consensus reached on ${issue}: ${decision}` : `Consensus not reached on ${issue}`,
      JSON.stringify({ issue, decision, quorumReached, ...data })
    );
  } catch (_) {}
}

function resolveIds(context) {
  const orchestratorId = context.orchestratorId;
  if (!orchestratorId) return { error: { success: false, error: 'orchestratorId required.' } };
  const rawIssue = context.issue;
  let issue = 'default_issue';
  if (typeof rawIssue === 'string' && rawIssue.length > 0) issue = rawIssue;
  return { orchestratorId, issue };
}

function parseVotePayload(text) {
  try {
    const payload = JSON.parse(text);
    if (payload !== null && typeof payload === 'object') return payload;
    return null;
  } catch (_) {
    return null;
  }
}

function freshTallyAcc() {
  return { tally: {}, seen: {}, voterIds: [], participationCount: 0, expressedCount: 0, abstainCount: 0, expressedWeight: 0 };
}

function absorbCountedVote(acc, senderId, rawVote) {
  if (acc.seen[senderId]) return;
  if (rawVote === undefined || rawVote === null) return;
  const text = qp.normalizeVoteText(rawVote);
  if (text === '') return;
  acc.seen[senderId] = true;
  acc.voterIds.push(senderId);
  acc.participationCount += 1;
  if (qp.isAbstentionText(text)) {
    acc.abstainCount += 1;
    return;
  }
  acc.tally[text] = acc.tally[text] || 0;
  acc.tally[text] += 1;
  acc.expressedCount += 1;
}

function absorbMessageRow(acc, issue, row) {
  const payload = parseVotePayload(row.payload_json);
  const text = qp.voteTextForIssue(payload, issue);
  if (text === null) return;
  absorbCountedVote(acc, row.sender_agent_id, text);
}

function collectMessageVotes(rows, issue) {
  const acc = freshTallyAcc();
  for (const row of rows) absorbMessageRow(acc, issue, row);
  return acc;
}

async function mergeInteropVotes(pack) {
  try {
    const proposal = await pack.db.get(SQL_FIND_PROPOSAL, pack.issue, pack.issue);
    if (!proposal) return;
    const restVotes = await pack.db.all(SQL_SWARM_VOTES, proposal.id);
    for (const rest of restVotes) absorbCountedVote(pack.acc, rest.agent_id, rest.vote);
  } catch (_) {}
}

function distinctVoterIds(rows, issue) {
  const seen = {};
  const out = [];
  for (const row of rows) {
    if (seen[row.sender_agent_id]) continue;
    const payload = parseVotePayload(row.payload_json);
    if (qp.voteTextForIssue(payload, issue) === null) continue;
    seen[row.sender_agent_id] = true;
    out.push(row.sender_agent_id);
  }
  return out;
}

function absorbWeightedRow(pack, row) {
  const acc = pack.acc;
  if (acc.seen[row.sender_agent_id]) return;
  const payload = parseVotePayload(row.payload_json);
  const text = qp.voteTextForIssue(payload, pack.issue);
  if (text === null) return;
  acc.seen[row.sender_agent_id] = true;
  acc.voterIds.push(row.sender_agent_id);
  acc.participationCount += 1;
  if (qp.isAbstentionText(text)) {
    acc.abstainCount += 1;
    return;
  }
  let score = 0.25;
  if (pack.scores !== null && pack.scores !== undefined) {
    const raw = Number(pack.scores[row.sender_agent_id]);
    if (Number.isFinite(raw)) score = raw;
  }
  const weight = qp.brierScoreToWeight(score);
  acc.tally[text] = acc.tally[text] || 0;
  acc.tally[text] += weight;
  acc.expressedWeight += weight;
  acc.expressedCount += 1;
}

function collectWeightedVotes(rows, issue, scores) {
  const pack = { acc: freshTallyAcc(), issue, scores };
  for (const row of rows) absorbWeightedRow(pack, row);
  return pack.acc;
}
function restVoteWeight(entry) {
  const brier = Number(entry.brier_score);
  if (Number.isFinite(brier)) return qp.brierScoreToWeight(brier);
  const direct = Number(entry.weight);
  if (Number.isFinite(direct)) return direct;
  return 1;
}

function absorbWeightedRestVote(acc, entry) {
  if (acc.seen[entry.agent_id]) return;
  if (entry.vote === undefined || entry.vote === null) return;
  const text = qp.normalizeVoteText(entry.vote);
  if (text === '') return;
  acc.seen[entry.agent_id] = true;
  acc.voterIds.push(entry.agent_id);
  acc.participationCount += 1;
  if (qp.isAbstentionText(text)) {
    acc.abstainCount += 1;
    return;
  }
  const weight = restVoteWeight(entry);
  acc.tally[text] = acc.tally[text] || 0;
  acc.tally[text] += weight;
  acc.expressedWeight += weight;
  acc.expressedCount += 1;
}

async function mergeInteropWeightedVotes(pack) {
  try {
    const proposal = await pack.db.get(SQL_FIND_PROPOSAL, pack.issue, pack.issue);
    if (!proposal) return;
    const restVotes = await pack.db.all(SQL_SWARM_VOTES_WEIGHTED, proposal.id);
    for (const rest of restVotes) absorbWeightedRestVote(pack.acc, rest);
  } catch (_) {}
}

async function persistQuorumResolution(pack, verdict) {
  const counts = {
    totalVotes: pack.acc.participationCount,
    expressedVotes: pack.acc.expressedCount,
    abstentions: pack.acc.abstainCount,
    approvalRate: verdict.approvalRate
  };
  if (pack.weighted) {
    await recordConsensusMessage({ db: pack.db, orchestratorId: pack.orchestratorId, kind: 'weighted_consensus_resolution', issue: pack.issue, decision: verdict.decision, quorumReached: verdict.quorumReached, data: { weightedVotes: pack.acc.tally, totalWeight: qp.tallyTotal(pack.acc.tally), ...counts } });
    await recordConsensusMessage({ db: pack.db, orchestratorId: pack.orchestratorId, kind: 'consensus_resolution', issue: pack.issue, decision: verdict.decision, quorumReached: verdict.quorumReached, data: { weightedVotes: pack.acc.tally, totalWeight: qp.tallyTotal(pack.acc.tally), approvalRate: verdict.approvalRate } });
    return;
  }
  await recordConsensusMessage({ db: pack.db, orchestratorId: pack.orchestratorId, kind: 'consensus_resolution', issue: pack.issue, decision: verdict.decision, quorumReached: verdict.quorumReached, data: { votes: pack.acc.tally, ...counts } });
}

function emitTallyTelemetry(pack, verdict, total) {
  let eventType = 'SWARM_QUORUM';
  let action = 'QUORUM';
  if (pack.weighted) {
    eventType = 'SWARM_WEIGHTED_QUORUM';
    action = 'WEIGHTED_QUORUM';
  }
  telemetry.emitEvent({
    eventType,
    agentId: pack.orchestratorId,
    action,
    detail: verdict.quorumReached ? `Quorum reached on ${pack.issue}: ${verdict.decision}` : `Quorum not reached on ${pack.issue}`,
    severity: 'info',
    payload: { issue: pack.issue, decision: verdict.decision, quorumReached: verdict.quorumReached, status: verdict.status, votes: pack.acc.tally, totalVotes: pack.acc.participationCount, expressedVotes: pack.acc.expressedCount, abstentions: pack.acc.abstainCount, totalWeight: total, approvalRate: verdict.approvalRate }
  });
}

function simpleResultOf(pack, verdict) {
  const result = {
    success: true,
    issue: pack.issue,
    decision: verdict.decision,
    quorumReached: verdict.quorumReached,
    status: verdict.status,
    votes: pack.acc.tally,
    totalVotes: pack.acc.participationCount,
    expressedVotes: pack.acc.expressedCount,
    abstentions: pack.acc.abstainCount,
    participationCount: pack.acc.participationCount,
    requiredVotes: verdict.requiredVotes,
    approvalRate: verdict.approvalRate
  };
  if (!verdict.quorumReached) result.error = 'Quorum not reached';
  return result;
}

function weightedResultOf(pack, verdict, total) {
  const result = {
    success: true,
    issue: pack.issue,
    decision: verdict.decision,
    quorumReached: verdict.quorumReached,
    status: verdict.status,
    weightedVotes: pack.acc.tally,
    weightedTally: pack.acc.tally,
    totalVotes: pack.acc.participationCount,
    expressedVotes: pack.acc.expressedCount,
    abstentions: pack.acc.abstainCount,
    participationCount: pack.acc.participationCount,
    requiredVotes: verdict.requiredVotes,
    totalWeight: total,
    approvalRate: verdict.approvalRate
  };
  if (!verdict.quorumReached) result.error = 'Quorum not reached';
  return result;
}

function buildTallyResult(pack, verdict, total) {
  if (pack.weighted) return weightedResultOf(pack, verdict, total);
  return simpleResultOf(pack, verdict);
}
async function finishTallyQuorum(pack) {
  const total = qp.tallyTotal(pack.acc.tally);
  let threshold = qp.DEFAULT_THRESHOLD;
  const directThreshold = Number(pack.context.threshold);
  if (Number.isFinite(directThreshold)) threshold = directThreshold;
  else {
    const alternate = Number(pack.context.quorumThreshold);
    if (Number.isFinite(alternate)) threshold = alternate;
  }
  let active = null;
  const directActive = Number(pack.context.activeCount);
  if (Number.isFinite(directActive)) active = directActive;
  else {
    const nodes = Number(pack.context.activeNodeCount);
    if (Number.isFinite(nodes)) active = nodes;
  }
  const verdict = qp.evaluateQuorum({
    tally: pack.acc.tally,
    participationCount: pack.acc.participationCount,
    expressedCount: pack.acc.expressedCount,
    activeCount: active,
    threshold,
    minVotes: pack.context.minVotes,
    minParticipation: pack.context.minParticipation
  });
  await persistQuorumResolution(pack, verdict);
  emitTallyTelemetry(pack, verdict, total);
  return buildTallyResult(pack, verdict, total);
}

async function quorum(context = {}) {
  const safe = safeContext(context);
  try {
    const db = await getDatabase();
    const ids = resolveIds(safe);
    if (ids.error) return ids.error;
    const rows = await db.all(SQL_ORG_VOTES, ids.orchestratorId, ids.issue);
    const acc = collectMessageVotes(rows, ids.issue);
    await mergeInteropVotes({ db, issue: ids.issue, acc });
    return finishTallyQuorum({ db, context: safe, orchestratorId: ids.orchestratorId, issue: ids.issue, acc, weighted: false });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function weightedQuorum(context = {}) {
  const safe = safeContext(context);
  try {
    const db = await getDatabase();
    const ids = resolveIds(safe);
    if (ids.error) return ids.error;
    const rows = await db.all(SQL_ORG_VOTES, ids.orchestratorId, ids.issue);
    const voterIds = distinctVoterIds(rows, ids.issue);
    const brierRes = await brierScores({
      agentIds: voterIds,
      calibrationScores: safe.calibrationScores,
      calibrationObservations: safe.calibrationObservations,
      allowDefaults: true,
      defaultScore: defaultScoreOf(safe)
    });
    if (!brierRes.success) return brierRes;
    const acc = collectWeightedVotes(rows, ids.issue, brierRes.scores);
    await mergeInteropWeightedVotes({ db, issue: ids.issue, acc });
    return finishTallyQuorum({ db, context: safe, orchestratorId: ids.orchestratorId, issue: ids.issue, acc, weighted: true });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { brierScores, quorum, weightedQuorum };
