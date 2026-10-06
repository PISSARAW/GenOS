'use strict';

const routing = require('../routing/routePlanner');
const receiptService = require('../learning/routeReceiptService');
const { normalizeCapabilityNeed } = require('../contracts/capabilityNeed');
const merge = require('../bridges/mergePolicyEvaluationService');

const DEFAULT_POLICY = Object.freeze({ version: 'rhizome-convergence/v1', minFitness: 0.7,
  minCoverage: 0.95, minProvenance: 1, minTransferReliability: 0.7,
  maxLatencyVariance: 100000, minLeaseMs: 1000, maxLeaseMs: 60000 });

function latestResults(session) {
  const latest = new Map();
  for (const entry of session.routeResults || []) latest.set(entry.receipt.needId, entry);
  return latest;
}

function validatedResult(input) {
  const { session, need, entry, policy } = input;
  if (!entry || entry.receipt.capability !== need.capability || entry.receipt.outcome !== 'SUCCESS' || !/^sha256:[a-f0-9]{64}$/.test(entry.receipt.executionDigest || '')) return null;
  try {
    const receipt = receiptService.validateReceipt(session, entry.receipt, policy.trustedVerifierDigests || []);
    if (!need.evidenceRequirements.every(ref => receipt.verification.evidenceRefs.includes(ref))) return null;
    return entry;
  } catch (_) { return null; }
}

function observedFitness(session, entries) {
  const ids = new Set(entries.flatMap(entry => entry.receipt.edgeIds));
  const edges = session.edges.filter(edge => ids.has(edge.edgeId));
  if (!edges.length) return entries.length ? 1 : 0;
  return edges.reduce((sum, edge) => sum + (edge.compatibility + edge.successRate + edge.evidenceQuality) / 3, 0) / edges.length;
}

function metrics(session, needs, policy) {
  const latest = latestResults(session);
  const details = needs.map(need => {
    const route = routing.plan(session, need, session.variantPolicy?.routing || {});
    const entry = validatedResult({ session, need, entry: latest.get(need.needId), policy });
    return { needId: need.needId, reachable: route.selected, verified: Boolean(entry && route.selected), entry };
  });
  const completed = details.filter(item => item.verified);
  const entries = completed.map(item => item.entry);
  const nodes = session.nodes.filter(node => entries.some(entry => entry.receipt.nodeIds.includes(node.nodeId)));
  return { details, entries, values: {
    bridgeFitness: observedFitness(session, entries), coverage: needs.length ? completed.length / needs.length : 0,
    provenanceScore: entries.length ? 1 : 0,
    transferReliability: nodes.length ? Math.min(...nodes.map(node => node.reliability ?? 0)) : 0,
    stability: details.length ? completed.length / details.length : 0
  } };
}

function assess(session, input = {}) {
  const needs = (input.needs || session.activeNeeds || []).map(normalizeCapabilityNeed);
  const { details, entries, values } = metrics(session, needs, input);
  const evidenceRefs = [...new Set(entries.flatMap(entry => entry.receipt.verification.evidenceRefs))];
  const latencySamplesMs = entries.map(entry => entry.latencyMs).filter(value => Number.isFinite(value) && value >= 0);
  const snapshot = { contract: 'RhizomeMissionMetrics/v1', graphVersion: session.graphVersion,
    metrics: values, completedNeedIds: details.filter(item => item.verified).map(item => item.needId),
    unresolvedNeedIds: details.filter(item => !item.verified).map(item => item.needId), evidenceRefs,
    latencySamplesMs, canMerge: false, transferAllowed: false };
  if (!needs.length || !entries.length || !latencySamplesMs.length) return { ...snapshot, reason: 'VERIFIED_EXECUTION_REQUIRED' };
  const evaluation = merge.evaluateMerge({ graphRevision: String(session.graphVersion),
    expectedGraphRevision: String(input.expectedGraphVersion ?? session.graphVersion),
    policy: input.policy || DEFAULT_POLICY, metrics: values, latencySamplesMs, evidenceRefs });
  return { ...snapshot, ...evaluation.decision, evaluation, reason: evaluation.decision.canMerge ? 'GATES_PASSED' : 'GATES_REJECTED' };
}

module.exports = { assess, DEFAULT_POLICY };
