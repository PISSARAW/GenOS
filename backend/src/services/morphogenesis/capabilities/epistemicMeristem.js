'use strict';

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))].sort();
}

function requireIdentity(value) {
  if (!value || !value.experimentId || !value.hypothesisId || !value.verifierId) {
    throw new Error('experimentId, hypothesisId and verifierId are required');
  }
  if (value.replicationOf && !value.independentVerifierId) {
    throw new Error('Independent replication needs a distinct verifier');
  }
}

function experiment(value) {
  requireIdentity(value);
  const predictions = unique(value.predictions);
  const outcomes = unique(value.discriminatingOutcomes);
  if (!predictions.length || outcomes.length < 2) {
    throw new Error('An experiment needs predictions and two discriminating outcomes');
  }
  return {
    experimentId: String(value.experimentId), hypothesisId: String(value.hypothesisId),
    verifierId: String(value.verifierId), predictions, discriminatingOutcomes: outcomes,
    assumptions: unique(value.assumptions), dependencies: unique(value.dependencies),
    intervention: value.intervention || null, sourceRefs: unique(value.sourceRefs),
    tools: unique(value.tools), failureModes: unique(value.failureModes),
    replicationOf: value.replicationOf ? String(value.replicationOf) : null,
    independentVerifierId: value.independentVerifierId ? String(value.independentVerifierId) : null,
    utility: Number(value.utility), cost: Number(value.cost)
  };
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((item) => b.has(item)).length / union.size;
}

function behavioralSimilarity(left, right) {
  return (jaccard(left.predictions, right.predictions)
    + jaccard(left.discriminatingOutcomes, right.discriminatingOutcomes)
    + jaccard(left.dependencies, right.dependencies)
    + jaccard(left.failureModes, right.failureModes)) / 4;
}

function verifiedCoverage(receipts) {
  return (Array.isArray(receipts) ? receipts : []).filter((receipt) =>
    receipt.status === 'VERIFIED' && receipt.verifierId
      && Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0
      && receipt.experiment && receipt.verifierId === receipt.experiment.verifierId);
}

function rankExperiments(input = {}) {
  const occupied = verifiedCoverage(input.coverageReceipts).map((item) => experiment(item.experiment));
  const penalty = Number.isFinite(input.inhibitionWeight) ? input.inhibitionWeight : 0.5;
  return (input.candidates || []).map((value) => {
    const candidate = experiment(value);
    if (!Number.isFinite(candidate.utility) || !Number.isFinite(candidate.cost) || candidate.cost < 0) {
      throw new Error('Experiment utility and cost must be finite');
    }
    const replica = independentReplication(candidate, occupied);
    const inhibition = replica ? 0 : occupied.reduce((sum, item) =>
      sum + behavioralSimilarity(candidate, item), 0);
    return { experiment: candidate, score: candidate.utility - penalty * inhibition - candidate.cost,
      inhibition, reason: replica ? 'INDEPENDENT_REPLICATION' : 'UNCOVERED_DISTINCTION' };
  }).sort((a, b) => b.score - a.score || a.experiment.experimentId.localeCompare(b.experiment.experimentId));
}

function independentReplication(candidate, occupied) {
  if (!candidate.replicationOf) return false;
  const source = occupied.find((item) => item.experimentId === candidate.replicationOf);
  if (!source || !candidate.independentVerifierId || candidate.independentVerifierId === source.verifierId) {
    throw new Error('VERIFIED_REPLICATION_SOURCE_AND_DISTINCT_VERIFIER_REQUIRED');
  }
  return true;
}

module.exports = { experiment, behavioralSimilarity, verifiedCoverage, rankExperiments };
