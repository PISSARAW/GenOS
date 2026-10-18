'use strict';

const { compileConditionalMorphogenesisPolicy } = require('./conditionalMorphogenesisPolicy');
const { critiqueStrategy } = require('./strategyCritiqueService');
const { arbitrateGroupNeeds } = require('./groupResourceNegotiation');
const { extractEvidenceReport } = require('../agentEvidenceService');
const resourceReallocation = require('./resourceReallocationCandidate');
const nosologyBridge = require('./morphogenesisNosologyBridge');
const nosologyCalibration = require('./morphogenesisNosologyCalibration');

function workerFor(state, workerId) { return state.workers.get(workerId) || {}; }

function reportFor(result) {
  return extractEvidenceReport(result.payload) || {};
}

function diagnosisFor(signals, results) {
  const reports = results.map(reportFor);
  const confidences = reports.map((report) => Number(report.confidence)).filter(Number.isFinite);
  const contradiction = signals.spread / 100;
  const provenanceRisk = reports.filter((report) => !report.workerArtifact?.provenance?.sourceRefs?.length).length
    / Math.max(1, reports.length);
  return { uncertainty: signals.uncertainty, contradiction, provenanceRisk,
    causalAmbiguity: Math.max(0, 1 - (confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0)),
    deterministicNeed: signals.failures ? 0.8 : 0.2,
    adversarialRisk: signals.failures ? 0.8 : 0.2,
    monitoringNeed: signals.uncertainty, stagnation: signals.average < 60 ? 0.7 : 0.1 };
}

function critiqueReports(results) {
  return results.flatMap((result) => {
    const assessment = reportFor(result).strategyAssessment;
    if (!assessment || !['supports_current', 'supports_alternative', 'inconclusive'].includes(assessment.outcome)) return [];
    const provenance = reportFor(result).workerArtifact?.provenance || {};
    return [{ id: result.agentId, sourceId: provenance.sourceId || assessment.sourceId,
      lineageId: provenance.lineageId || assessment.lineageId,
      evidenceRefs: assessment.evidenceRefs || provenance.sourceRefs || [], outcome: assessment.outcome }];
  });
}

function strategyChallenge(input, diagnosis) {
  const results = [...input.state.results.values()];
  const reports = critiqueReports(results);
  if (reports.length < 2) return null;
  const first = results.map(reportFor).map((report) => report.strategyAssessment).find(Boolean) || {};
  if (!first.currentHypothesis || !first.currentFalsifier
    || !first.alternativeHypothesis || !first.alternativeFalsifier) return null;
  const budget = Math.max(0, Math.floor(Number(input.continuation.pool) || 0));
  const result = critiqueStrategy({
    currentStrategy: { id: first.currentStrategyId || 'current', hypothesis: first.currentHypothesis,
      falsifier: first.currentFalsifier },
    alternative: { id: first.alternativeId || 'alternative', hypothesis: first.alternativeHypothesis,
      falsifier: first.alternativeFalsifier },
    reports, challengeBudget: { tokens: budget, challengeCostTokens: Math.max(1, Math.floor(budget * 0.1)), maxChallenges: 1 }
  });
  return { ...result, diagnosis };
}

function resourceGroups(input) {
  const groups = new Map();
  for (const result of input.state.results.values()) {
    const report = reportFor(result);
    const worker = workerFor(input.state, result.agentId);
    for (const need of Array.isArray(report.resourceNeeds) ? report.resourceNeeds : []) {
      const groupId = String(worker.groupId || worker.morphologyTopology || worker.role || 'mission');
      if (!groups.has(groupId)) groups.set(groupId, { id: groupId, state: 'active', needs: [],
        governance: worker.governance || null });
      groups.get(groupId).needs.push(need);
    }
  }
  return [...groups.values()];
}

function resourceNegotiation(input, reservedChallengeTokens) {
  const groups = resourceGroups(input);
  if (!groups.some((group) => group.needs.length)) return null;
  const workers = [...input.state.workers.values()].map((worker) => ({ id: worker.agentId,
    groupId: worker.groupId || worker.morphologyTopology || worker.role || 'mission',
    workerKind: worker.workerKind, transferable: worker.transferable === true }));
  const plan = arbitrateGroupNeeds({ groups, budget: Math.max(0,
    (Number(input.continuation.pool) || 0) - reservedChallengeTokens),
    availableWorkers: workers, spawnAuthority: false, governanceAuthority: [] });
  return { ...plan, candidate: resourceReallocation.describeResourceReallocation(plan) };
}

function selectedMissionText(mission) { return mission.prompt || mission.currentTask || ''; }

function selectedMissionId(mission, orchestratorId) { return mission.missionId || orchestratorId; }

function currentPolicyTopology(plan) { return plan.morphogenesisPlan?.selectedTopology || plan.selectedTopology; }

function currentPolicyVariant(plan) { return plan.morphogenesisPlan?.selectedVariant || 'default'; }

function topologyCapabilities(mission) { return mission.topologyCapabilityInventory?.available || null; }

function coordinationPolicyOf(worker) { return worker.coordinationPolicy || worker.coordination_policy || {}; }

function commonCoordinationLease(workers) {
  const leases = workers.map((worker) => new Set(worker.toolLease || []));
  return leases.length ? [...leases[0]].filter((tool) => leases.every((lease) => lease.has(tool))) : [];
}

function continuousCadence(workers) {
  const allContinuous = workers.length && workers.every((worker) => {
    const policy = coordinationPolicyOf(worker);
    return String(policy.communicationCadence || policy.communication_cadence || '').toLowerCase() === 'continuous_sync';
  });
  return allContinuous ? 'continuous_sync' : null;
}

function requiredCoordinationTools(mission, workers) {
  const workerTools = workers.flatMap((worker) => [...(worker.requiredTools || []), ...(worker.toolRequirements || [])]);
  return [...new Set([...(mission.requiredTools || []), ...workerTools])];
}

function communicationRequired(mission, workers) {
  return mission.communicationRequired === true || workers.some((worker) => worker.communicationRequired === true);
}

function communicationMissionFor(mission, workers, missionId) {
  return { missionId, organization: mission.organization || workers[0]?.organization || null,
    communicationRequired: communicationRequired(mission, workers),
    coordinationPolicy: { communicationCadence: continuousCadence(workers) },
    toolLease: commonCoordinationLease(workers), requiredTools: requiredCoordinationTools(mission, workers) };
}

function structuredProblemProfile(mission, plan) {
  return { ...(plan.profile || {}), ...(mission.problemProfile || {}) };
}

function conditionalPolicyInput(input, diagnosis, workers) {
  const mission = input.state.normalizedMission || {};
  const plan = input.state.plan || {};
  const missionId = selectedMissionId(mission, input.orchestratorId);
  return {
    mission: selectedMissionText(mission), missionId,
    communicationMission: communicationMissionFor(mission, workers, missionId),
    communicationMetric: input.communicationMetric || null,
    rosterReductionPlan: input.rosterReductionPlan || null,
    verifiedOutcomes: input.verifiedOutcomes,
    problemProfile: structuredProblemProfile(mission, plan),
    priorityWeights: mission.morphogenesisPolicy?.priorityWeights || null,
    allowScalarTieBreak: mission.morphogenesisPolicy?.allowScalarTieBreak === true,
    resourceAllocationPlan: input.resourceAllocationPlan || null,
    currentTopology: currentPolicyTopology(plan), currentVariant: currentPolicyVariant(plan),
    currentRecipe: plan.morphogenesisPlan?.morphologyExpression || null,
    diagnosis, budget: { tokens: Number(input.continuation.pool) || 0 },
    maxEpochs: mission.morphogenesisPolicy?.maxEpochs,
    workerAssignments: workers, availableWorkerKinds: workers.map((worker) => worker.workerKind),
    availableTopologyCapabilities: topologyCapabilities(mission),
    availableCapabilities: mission.missionCapabilityPlan?.availableCapabilities,
    operationalConstraints: plan.operationalConstraints || {}
  };
}

function rosterReductionPlan(input, workers) {
  const mission = input.state.normalizedMission || {};
  const target = Number(mission.morphogenesisPolicy?.rosterReductionTarget);
  if (!Number.isSafeInteger(target) || target < 1 || target >= workers.length) return null;
  const requiredRoles = mission.morphogenesisPolicy?.requiredRosterRoles || [];
  const ranked = rankRosterWorkers(workers);
  const retained = retainRequiredRoles(ranked, requiredRoles);
  fillRetainedRoster(retained, ranked, target);
  return { currentWorkerIds: workers.map((worker) => worker.agentId),
    retainedWorkerIds: retained, requiredRoles, workers };
}

function rankRosterWorkers(workers) {
  return workers.slice().sort((left, right) =>
    Number(right.evidenceScore || 0) - Number(left.evidenceScore || 0)
      || left.agentId.localeCompare(right.agentId));
}

function retainRequiredRoles(ranked, requiredRoles) {
  const retained = [];
  for (const role of requiredRoles) {
    const worker = ranked.find((item) => item.role === role && !retained.includes(item.agentId));
    if (worker) retained.push(worker.agentId);
  }
  return retained;
}

function fillRetainedRoster(retained, ranked, target) {
  for (const worker of ranked) {
    if (retained.length >= target) break;
    if (!retained.includes(worker.agentId)) retained.push(worker.agentId);
  }
}

function supportDecisions(input, diagnosis) {
  const challenge = strategyChallenge(input, diagnosis);
  const challengeReserve = challenge?.challenge?.reservedTokens || 0;
  const resources = resourceNegotiation(input, challengeReserve);
  return { challenge, resources };
}

function compilePolicy(input, signals) {
  const state = input.state;
  const workers = input.survivors.map((survivor) => ({
    ...workerFor(state, survivor.agentId), agentId: survivor.agentId,
    evidenceScore: survivor.evidenceScore }));
  const rawDiagnosis = diagnosisFor(signals, [...state.results.values()]);
  const calibration = nosologyCalibration.compileCalibration(
    input.nosologyProjectionOutcomes || input.verifiedOutcomes);
  const requestedMode = state.normalizedMission?.morphogenesisPolicy?.nosologyProjectionMode;
  const selection = nosologyCalibration.selectMode(calibration, requestedMode);
  const projected = nosologyBridge.projectSignals(rawDiagnosis, input.nosology, selection.mode);
  const diagnosis = projected.signals;
  const projectionReceipt = { ...projected.receipt, selectionReason: selection.reason,
    calibration: { status: calibration.status, reason: calibration.reason || null,
      commonHoldoutCaseCount: calibration.commonHoldoutCaseCount },
    shadow: nosologyBridge.shadowComparison(rawDiagnosis, input.nosology) };
  const supports = supportDecisions(input, diagnosis);
  const { challenge, resources } = supports;
  const rosterPlan = rosterReductionPlan(input, workers);
  const policy = nosologyBridge.decoratePolicy(compileConditionalMorphogenesisPolicy({
    ...conditionalPolicyInput({ ...input, rosterReductionPlan },
      withIntraEpoch(input, diagnosis), workers), resourceAllocationPlan: resources
  }), input.nosology, projectionReceipt);
  const decision = { policy, challenge, resources, rosterPlan,
    intraEpoch: state.intraEpochObservations || null };
  state.plan.morphogenesisEpochDecision = decision;
  return decision;
}

function withIntraEpoch(input, diagnosis) {
  const observations = input.state?.intraEpochObservations;
  if (!observations) return diagnosis;
  const throttled = observations.throttle && observations.throttle.mode !== 'pass';
  return { ...diagnosis, intraEpochExchanges: { attempts: observations.attempts,
    redundant: observations.redundant, throttled: Boolean(throttled) },
    attentionHint: observations.attentionHint || null };
}

module.exports = { compilePolicy, diagnosisFor, critiqueReports, resourceGroups,
  communicationMissionFor, rosterReductionPlan };
