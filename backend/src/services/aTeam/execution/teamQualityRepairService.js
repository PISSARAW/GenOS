'use strict';

const policy = require('./teamQualityRepairPolicy');
const { persistRepair, requireRepairLease } = require('./teamQualityRepairStore');
const { digest } = require('../../qualityElevation/qualityContract');
const ACTIVE = new Set(['dispatching', 'awaiting_evidence']);
const STOPPED = new Set(['stagnated', 'exhausted', 'blocked', 'needs_review']);

function blockPending(input, member) {
  input.statuses.set(member.workerId, 'repairing');
  Object.assign(input.verdicts.get(member.workerId), { promoted: false, evidenceRefs: [], reason: 'quality_repair_pending' });
}

function blockStopped(input, member, record) {
  Object.assign(input.verdicts.get(member.workerId), { promoted: false, evidenceRefs: [],
    reason: `quality_repair_${record.status}`, details: [record.reason] });
}

function matchesCanonical(input, member) {
  const canonical = input.run.members.find((item) => item.workerId === member.workerId);
  if (!canonical) return false;
  return digest(policy.qualityContract(member)) === digest(policy.qualityContract(canonical))
    && digest(member.qualityRuntime || {}) === digest(canonical.qualityRuntime || {})
    && digest(member.modelBudgetScope || null) === digest(canonical.modelBudgetScope || null);
}

function handoffsFor(input, member) {
  const graph = structuredClone(input.graph);
  require('./handoffReceiptService').projectHandoffReceipts(graph, input);
  const byNode = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const nodes = new Set(graph.nodes.filter((node) => node.memberId === member.memberId).map((node) => node.nodeId));
  const incoming = graph.edges.filter((edge) => nodes.has(edge.toNode) && edge.blocking !== false);
  if (incoming.some((edge) => !liveProducer(input, edge, byNode))) return null;
  return incoming.map((edge) => edge.handoff).filter(Boolean);
}

function liveProducer(input, edge, byNode) {
  const producerNode = byNode.get(edge.fromNode);
  const producer = input.plan.members.find((member) => member.memberId === producerNode.memberId);
  return edge.available === true && input.verdicts.get(producer.workerId)?.promoted === true
    && input.statuses.get(producer.workerId) === 'completed';
}

async function retainFeedback(input, member, feedback) {
  const previous = input.run.execution.qualityRepairs?.[member.workerId] || {};
  const record = { ...previous, ...feedback, workerId: member.workerId, memberId: member.memberId };
  if (JSON.stringify(record) !== JSON.stringify(previous)) await persistRepair(input, member, record);
  return record;
}

async function reconcileAttempt(input, member, identity) {
  const previous = input.run.execution.qualityRepairs?.[member.workerId];
  if (!ACTIVE.has(previous?.status)) return false;
  if (input.expired) {
    await retainFeedback(input, member, { status: 'exhausted', category: 'budget', reason: 'ATEAM_DEADLINE_EXCEEDED' });
    return false;
  }
  if (identity.reportDigest === previous.previousReportDigest) {
    blockPending(input, member); return true;
  }
  if (identity.artifactDigest === previous.previousArtifactDigest) {
    await retainFeedback(input, member, { status: 'stagnated', category: 'quality', reason: 'ARTIFACT_UNCHANGED' });
    Object.assign(input.verdicts.get(member.workerId), { promoted: false, evidenceRefs: [], reason: 'quality_repair_stagnated' });
    return false;
  }
  const passed = input.verdicts.get(member.workerId).promoted === true;
  await retainFeedback(input, member, { status: passed ? 'resolved' : 'reviewed',
    category: 'quality', reason: passed ? 'FRESH_ARTIFACT_VALIDATED' : 'REPAIR_CRITERIA_UNVERIFIED', artifactDigest: identity.artifactDigest });
  return false;
}

async function dispatchRepair(input, member, details) {
  const previous = input.run.execution.qualityRepairs?.[member.workerId];
  const attempt = (previous?.attempt || 0) + 1;
  const handoffContext = handoffsFor(input, member);
  if (handoffContext === null) return;
  const request = policy.requestFor({ ...details, run: input.run, member, attempt });
  await retainFeedback(input, member, { status: 'dispatching', category: 'quality', attempt,
    reason: details.obligation.reason, previousArtifactDigest: details.identity.artifactDigest,
    previousReportDigest: details.identity.reportDigest, request });
  try {
    if (input.options?.onTick) await input.options.onTick();
    await requireRepairLease(input);
    const launched = await input.launch({ ...member, qualityRepair: request, handoffContext });
    if (launched === false) throw Object.assign(new Error('Native repair launch was refused.'), { code: 'GQEL_REPAIR_DISPATCH_REFUSED' });
    await retainFeedback(input, member, { status: 'awaiting_evidence', reason: 'FRESH_EVIDENCE_REQUIRED' });
    blockPending(input, member);
  } catch (error) {
    if (/LEASE_LOST|CANCEL/.test(error.code || '')) throw error;
    await retainFeedback(input, member, { status: 'blocked', category: policy.classifyCode(error.code),
      reason: error.code || 'GQEL_REPAIR_DISPATCH_FAILED' });
  }
}

async function considerMember(input, member, dossier) {
  if (!policy.qualityContract(member)) return;
  if (!matchesCanonical(input, member)) throw Object.assign(new Error('Repair quality contract differs from the canonical member.'), { code: 'GQEL_CONTRACT_CHANGED' });
  const identity = policy.artifactIdentity(dossier);
  if (await reconcileAttempt(input, member, identity)) return;
  const previous = input.run.execution.qualityRepairs?.[member.workerId];
  if (STOPPED.has(previous?.status)) { blockStopped(input, member, previous); return; }
  const feedback = policy.terminalFeedback(identity.report);
  if (feedback) { await retainFeedback(input, member, feedback); blockStopped(input, member, feedback); return; }
  await considerObligation(input, member, identity);
}

async function considerObligation(input, member, identity) {
  const obligation = policy.qualityObligation(member, input.verdicts.get(member.workerId));
  if (!obligation || input.statuses.get(member.workerId) !== 'completed') return;
  const previous = input.run.execution.qualityRepairs?.[member.workerId];
  if (input.expired || (previous?.attempt || 0) >= policy.maximumAttempts(member)) {
    await retainFeedback(input, member, { status: 'exhausted', category: 'budget', reason: 'GQEL_REPAIR_LIMIT' }); return;
  }
  if (typeof input.launch !== 'function') return;
  await dispatchRepair(input, member, { identity, obligation });
}

async function coordinateQualityRepairs(input) {
  const context = { ...input };
  for (const [index, member] of input.plan.members.entries()) {
    await considerMember(context, member, input.dossiers[index]);
  }
  return Object.values(context.run.execution.qualityRepairs || {});
}

module.exports = { coordinateQualityRepairs };
