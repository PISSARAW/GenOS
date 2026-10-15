'use strict';

const OUTCOMES = new Set(['supports_current', 'supports_alternative', 'inconclusive']);
const INDEPENDENCE_BASES = new Set(['direct_measurement', 'independent_tool', 'replay']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(nonEmpty).map(value => value.trim()))];
}

function strategyCheck(strategy) {
  return Boolean(strategy && nonEmpty(strategy.id) && nonEmpty(strategy.hypothesis)
    && nonEmpty(strategy.falsifier));
}

function alternativeCheck(alternative) {
  return Boolean(alternative && nonEmpty(alternative.id) && nonEmpty(alternative.hypothesis)
    && nonEmpty(alternative.falsifier));
}

function reportRecord(report, index) {
  const evidenceRefs = uniqueStrings(report?.evidenceRefs);
  return {
    id: nonEmpty(report?.id) ? report.id : `report-${index + 1}`,
    outcome: OUTCOMES.has(report?.outcome) ? report.outcome : 'inconclusive',
    sourceId: nonEmpty(report?.sourceId) ? report.sourceId : null,
    lineageId: nonEmpty(report?.lineageId) ? report.lineageId : null,
    evidenceRefs,
    provenanceComplete: Boolean(report?.sourceId && report?.lineageId && evidenceRefs.length)
  };
}

function sharedEvidence(left, right) {
  return left.evidenceRefs.some(ref => right.evidenceRefs.includes(ref));
}

function reportsShareOrigin(left, right) {
  return (left.sourceId && left.sourceId === right.sourceId)
    || (left.lineageId && left.lineageId === right.lineageId)
    || sharedEvidence(left, right);
}

function findRoot(parents, index) {
  if (parents[index] !== index) parents[index] = findRoot(parents, parents[index]);
  return parents[index];
}

function unionRoots(parents, left, right) {
  const leftRoot = findRoot(parents, left);
  const rightRoot = findRoot(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function groupConnectedReports(records, parents) {
  return records.reduce((groups, record, index) => {
    const key = findRoot(parents, index);
    groups.set(key, [...(groups.get(key) || []), record]);
    return groups;
  }, new Map());
}

function connectedReports(records) {
  const parents = records.map((_, index) => index);
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      if (reportsShareOrigin(records[left], records[right])) unionRoots(parents, left, right);
    }
  }
  return groupConnectedReports(records, parents);
}

function summarizeReports(reports) {
  const records = (Array.isArray(reports) ? reports : []).map(reportRecord);
  const groups = [...connectedReports(records).values()];
  const independentSupport = { current: 0, alternative: 0 };
  const clusters = groups.map((group, index) => {
    const provenanceComplete = group.every(item => item.provenanceComplete);
    const hasCurrent = group.some(item => item.outcome === 'supports_current');
    const hasAlternative = group.some(item => item.outcome === 'supports_alternative');
    const outcome = clusterOutcome(provenanceComplete, hasCurrent, hasAlternative);
    if (outcome === 'supports_current') independentSupport.current += 1;
    if (outcome === 'supports_alternative') independentSupport.alternative += 1;
    return {
      id: `source-cluster-${index + 1}`,
      reportIds: group.map(item => item.id),
      sourceIds: uniqueStrings(group.map(item => item.sourceId)),
      lineageIds: uniqueStrings(group.map(item => item.lineageId)),
      provenanceComplete,
      outcome
    };
  });
  return { reportCount: records.length, clusters, independentSupport };
}

function clusterOutcome(provenanceComplete, hasCurrent, hasAlternative) {
  if (!provenanceComplete) return 'provenance_incomplete';
  if (hasCurrent === hasAlternative) return 'mixed_or_inconclusive';
  return hasCurrent ? 'supports_current' : 'supports_alternative';
}

function validIndependentObservation(observation, reportSummary) {
  if (!observationShapeValid(observation)) return false;
  const knownSources = reportSummary.clusters.flatMap(cluster => cluster.sourceIds);
  const knownLineages = reportSummary.clusters.flatMap(cluster => cluster.lineageIds);
  return sourceIsIndependent(observation, knownSources, knownLineages);
}

function observationShapeValid(observation) {
  return Boolean(observation && observation.verified === true && nonEmpty(observation.verifierReceiptId)
    && nonEmpty(observation.sourceId) && nonEmpty(observation.evidenceRef) && nonEmpty(observation.observationId)
    && INDEPENDENCE_BASES.has(observation.independenceBasis) && OUTCOMES.has(observation.outcome));
}

function sourceIsIndependent(observation, knownSources, knownLineages) {
  return !knownSources.includes(observation.sourceId) && !knownLineages.includes(observation.sourceId);
}

function budgetInputValid(tokens, challengeCost, maxChallenges) {
  return Number.isFinite(tokens) && tokens >= 0 && Number.isFinite(challengeCost)
    && challengeCost > 0 && Number.isInteger(maxChallenges) && maxChallenges >= 0;
}

function budgetDecision(budget = {}) {
  const tokens = Number(budget.tokens);
  const challengeCost = Number(budget.challengeCostTokens);
  const maxChallenges = Number(budget.maxChallenges);
  const valid = budgetInputValid(tokens, challengeCost, maxChallenges);
  const affordable = valid && maxChallenges > 0 && tokens >= challengeCost;
  return { valid, affordable, tokens: valid ? Math.floor(tokens) : 0,
    challengeCostTokens: valid ? Math.ceil(challengeCost) : 0,
    remainingTokens: affordable ? Math.floor(tokens - challengeCost) : valid ? Math.floor(tokens) : 0 };
}

function critiqueStrategy(input = {}) {
  const currentValid = strategyCheck(input.currentStrategy);
  const alternativeValid = alternativeCheck(input.alternative);
  const reportSummary = summarizeReports(input.reports);
  const budget = budgetDecision(input.challengeBudget);
  const observation = validIndependentObservation(input.independentObservation, reportSummary)
    ? input.independentObservation : null;
  const status = critiqueStatus({ currentValid, alternativeValid, budget, observation });
  return {
    schemaVersion: 1,
    kind: 'morphogenesis_strategy_critique',
    status,
    currentHypothesis: currentValid ? input.currentStrategy.hypothesis : null,
    currentFalsifier: currentValid ? input.currentStrategy.falsifier : null,
    alternativeHypothesis: alternativeValid ? input.alternative.hypothesis : null,
    alternativeFalsifier: alternativeValid ? input.alternative.falsifier : null,
    evidence: evidenceResult(reportSummary, observation),
    challenge: challengeResult(status, budget),
    resolutionReceipt: resolutionReceipt(observation),
    promotionAuthorized: false
  };
}

function evidenceResult(reportSummary, observation) {
  const singleCompleteCluster = reportSummary.clusters.length === 1
    && reportSummary.clusters[0].provenanceComplete;
  return {
    reports: reportSummary,
    correlatedConsensusRejected: reportSummary.reportCount > 1 && singleCompleteCluster,
    independentObservationAccepted: Boolean(observation),
    uncertaintyReason: observation ? null : 'no_verified_independent_observation'
  };
}

function challengeResult(status, budget) {
  const authorized = status === 'challenge_authorized';
  return {
    authorized,
    maxAttempts: authorized ? 1 : 0,
    budgetTokens: budget.tokens,
    reservedTokens: authorized ? budget.challengeCostTokens : 0,
    remainingTokens: authorized ? budget.remainingTokens : budget.tokens
  };
}

function resolutionReceipt(observation) {
  if (!observation) return null;
  return {
    observationId: observation.observationId,
    verifierReceiptId: observation.verifierReceiptId,
    evidenceRef: observation.evidenceRef,
    outcome: observation.outcome
  };
}

function critiqueStatus(input) {
  const { currentValid, alternativeValid, budget, observation } = input;
  if (!currentValid || !alternativeValid || !budget.valid) return 'invalid_critique_contract';
  if (observation?.outcome === 'supports_current') return 'resolved_current';
  if (observation?.outcome === 'supports_alternative') return 'resolved_alternative';
  return budget.affordable ? 'challenge_authorized' : 'challenge_budget_exhausted';
}

module.exports = { critiqueStrategy, summarizeReports };
