'use strict';

const { createHash } = require('crypto');
const { detectDysbiosis } = require('../health/dysbiosisDetector');
const { validateToolManifest, validateToolInvocation, authorizeToolInvocation, executeToolInvocation } = require('./toolRuntimeService');
const { reconcileEdgeEvents, simulateEdgeSynchronization } = require('./edgeSyncRuntimeService');
const { reviewThreat, reviewThreatBatch } = require('./immuneThreatRuntimeService');
const { planRegeneration, simulateRegeneration } = require('./regenerationRuntimeService');
const { authorizeCompetitiveReplacement } = require('./competitiveReplacementRuntimeService');

const { invalid, record, text, evidence, score, sameBudget } = require('./variantInputValidation');
const { planPlacement, planPlacementBatch } = require('./variantPlacementService');

function replacementGate(input, core) {
  if (input.replacementRequested !== true) return false;
  const restored = typeof input.verifyRestoration === 'function'
    && input.verifyRestoration(input.restorationReceipt) === true;
  const rollback = typeof input.verifyRollbackSnapshot === 'function'
    && input.verifyRollbackSnapshot(input.rollbackSnapshot) === true;
  const approved = typeof input.approveReplacement === 'function'
    && input.approveReplacement([...core]) === true;
  return restored && rollback && approved;
}

function coreDependencyClosure(nodes, edges, core) {
  const closure = new Set(core);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (closure.has(edge.target) && !closure.has(edge.source)) {
        closure.add(text(edge.source, 'dependent id'));
        changed = true;
      }
    }
  }
  const known = new Set(nodes.map((node) => node.id));
  if ([...closure].some((id) => !known.has(id))) throw invalid('Dependency graph references an unknown core symbiont.');
  return closure;
}

function assessOrganelle(input = {}) {
  const graph = record(input.dependencyGraph, 'dependencyGraph');
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const core = new Set(nodes.filter((node) => node.core === true).map((node) => text(node.id, 'core id')));
  const closure = coreDependencyClosure(nodes, edges, core);
  const dependents = [...closure].filter((id) => !core.has(id));
  const replacementRequested = input.replacementRequested === true;
  const replacementAllowed = replacementGate(input, closure);
  return { coreSymbiontIds: [...core], coreDependencyClosureIds: [...closure], dependentSymbiontIds: dependents,
    replacementAllowed, blockedReasons: !replacementRequested || replacementAllowed ? [] : ['approval_snapshot_and_restoration_proof_required'],
    inheritance: { preserveCoreIdentity: true, evidenceRefs: evidence(input.evidenceRefs) } };
}

function testOrganelleEssentiality(input = {}) {
  const trials = Array.isArray(input.trials) ? input.trials : [];
  const results = trials.map((trial) => {
    const item = record(trial, 'essentiality trial');
    const without = score(item.withoutCore, 'withoutCore');
    const withCore = score(item.withCore, 'withCore');
    const refs = evidence(item.evidenceRefs);
    const restorationVerified = typeof input.verifyRestoration === 'function'
      && input.verifyRestoration(item.restorationReceipt) === true;
    return { symbiontId: text(item.symbiontId, 'symbiontId'), impact: withCore - without,
      essential: restorationVerified && withCore > without, evidenceRefs: refs };
  });
  return { results, essentialSymbiontIds: results.filter((item) => item.essential).map((item) => item.symbiontId),
    promotionAllowed: results.length > 0 && results.every((item) => item.essential) };
}

function ecologySamples(history) {
  return history.map((item) => ({ score: score(item.score, 'fitness score'), evidenceRefs: evidence(item.evidenceRefs) }));
}

function ecologyInputs(input) {
  const floor = Number(input.diversityFloor ?? 2);
  const diversity = Number(input.diversity ?? 0);
  if (!Number.isInteger(floor) || floor < 1 || !Number.isInteger(diversity) || diversity < 0) throw invalid('Diversity values must be non-negative integers.');
  return { floor, diversity };
}

function fitnessDelta(samples) {
  return samples.length ? samples[samples.length - 1].score - samples[0].score : null;
}

function perSymbiontFitness(history) {
  const records = Object.entries(record(history, 'fitnessBySymbiont'));
  return records.map(([symbiontId, values]) => {
    if (!Array.isArray(values) || values.length < 2) throw invalid(`Fitness history for ${symbiontId} needs at least two samples.`);
    const samples = ecologySamples(values);
    return { symbiontId, samples: samples.length, fitnessDelta: fitnessDelta(samples) };
  });
}

function assessEcology(input = {}) {
  const { floor, diversity } = ecologyInputs(input);
  const samples = ecologySamples(Array.isArray(input.fitnessHistory) ? input.fitnessHistory : []);
  const symbiontFitness = input.fitnessBySymbiont ? perSymbiontFitness(input.fitnessBySymbiont) : [];
  const dysbiosis = input.dysbiosisSignals
    ? detectDysbiosis(input.dysbiosisSignals).state === 'ALERT' : false;
  const decliningSymbiontIds = symbiontFitness.filter((item) => item.fitnessDelta < 0).map((item) => item.symbiontId);
  const action = dysbiosis ? 'QUARANTINE_AND_REVIEW'
    : diversity < floor ? 'ACQUIRE_CANDIDATE' : decliningSymbiontIds.length ? 'REVIEW_CONTRIBUTORS' : 'CONTINUE';
  return { longitudinalSamples: samples.length, fitnessDelta: fitnessDelta(samples),
    action, diversityFloor: floor, diversity, symbiontFitness, decliningSymbiontIds,
    dysbiosis, automaticReplacement: false };
}

function checkEcologyPayload(result, cycle) {
  if (simulateEcologyCondition(result)) throw invalid('Cycle evaluator returned an invalid record.');
  const diversity = Number(result.diversity);
  if (!Number.isInteger(diversity) || diversity < 0) throw invalid(`Cycle ${cycle + 1} diversity must be a non-negative integer.`);
  return { cycleEvidence: evidence(result.evidenceRefs, `cycle ${cycle + 1} evidenceRefs`), fitness: score(result.fitness, `cycle ${cycle + 1} fitness`), diversity };
}

async function simulateEcology(input = {}) {
  const cycles = Number(input.cycles ?? 20);
  if (simulateEcologyCondition2(cycles)) throw invalid('Ecology simulation is limited to 1–20 cycles.');
  if (typeof input.evaluateCycle !== 'function') throw invalid('A cycle evaluator is required.', 'HOLOBIONT_ECOLOGY_EVALUATOR_REQUIRED');
  const history = [];
  let state = input.initialState || {};
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const result = await input.evaluateCycle({ cycle: cycle + 1, state, history: history.slice() });
    const checked = checkEcologyPayload(result, cycle);
    history.push({ cycle: cycle + 1, fitness: checked.fitness, evidenceRefs: checked.cycleEvidence, diversity: checked.diversity, dysbiosis: result.dysbiosis === true });
    state = result.state || state;
    if (result.stop === true || result.dysbiosis === true) break;
  }
  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.fitness - first.fitness;
  const action = ecologyAction(history, last, input);
  return { status: 'SIMULATED', cyclesCompleted: history.length, history, fitnessDelta: delta,
    action, automaticReplacement: false, finalState: state };
}

function addMemory(context, memory) {
  const { conflicts, byKey, allByKey } = context;
  const item = record(memory, 'memory');
  text(item.id, 'memory.id');
    if (item.memoryType === 'PROCEDURAL' && item.procedureVerified !== true) {
      throw invalid('Procedural memory requires a verified procedure.', 'HOLOBIONT_PROCEDURE_UNVERIFIED');
    }
  const refs = evidence(item.evidenceRefs);
  const key = text(item.conceptKey, 'memory.conceptKey');
  const group = allByKey.get(key) || [];
  for (const prior of group) {
    if (JSON.stringify(prior.value) !== JSON.stringify(item.value)) {
      conflicts.push({ conceptKey: key, memoryIds: [prior.id, item.id] });
    }
  }
  group.push({ id: item.id, value: item.value });
  allByKey.set(key, group);
  const current = byKey.get(key);
  const fitness = score(item.fitness, 'memory.fitness');
  if (!current || fitness > current.fitness) byKey.set(key, { id: item.id, value: item.value, fitness,
    memoryType: item.memoryType || null, provenance: { sourceId: item.sourceId || null, evidenceRefs: refs } });
}

function planMemory(input = {}) {
  const context = { conflicts: [], byKey: new Map(), allByKey: new Map() };
  for (const memory of Array.isArray(input.memories) ? input.memories : []) addMemory(context, memory);
  const { conflicts, byKey } = context;
  const restricted = new Set(Array.isArray(input.restrictedDataClasses) ? input.restrictedDataClasses : []);
  if (Array.isArray(input.memories) && input.memories.some((item) => (item.dataClasses || []).some((label) => restricted.has(label)))) {
    throw invalid('Memory contains data restricted by the Host constitution.', 'HOLOBIONT_PRIVACY_VIOLATION');
  }
  const forgetBelow = score(input.forgetBelow ?? 0.1, 'forgetBelow');
  return { stores: ['GRAPH', 'SEMANTIC', 'EPISODIC', 'PROCEDURAL'], conflicts,
    consolidation: [...byKey.values()], forgettingCandidates: [...byKey.values()].filter((item) => item.fitness < forgetBelow).map((item) => item.id),
    automaticForgetting: false };
}

function competitiveTrial(candidate, budget) {
    const item = record(candidate, 'candidate');
    const trialBudget = record(item.budget, 'candidate.budget');
    if (!sameBudget(trialBudget, budget)) throw invalid('All challengers must use the same budget.', 'HOLOBIONT_COMPETITION_BUDGET_MISMATCH');
    return { id: text(item.id, 'candidate.id'), score: score(item.score, 'candidate.score'),
      evidenceRefs: evidence(item.evidenceRefs), diversityGroup: text(item.diversityGroup, 'diversityGroup') };
}

function verifiedTrials(input, candidates, budget) {
  return candidates.map((candidate) => competitiveTrial(candidate, budget))
    .filter((item) => typeof input.verifyTrial === 'function' && input.verifyTrial(item.id, item.evidenceRefs) === true)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function championFor(trials, input) {
  const eligible = input.allowGroupChangeVerified === true ? trials
    : trials.filter((item) => input.protectedGroups?.includes(item.diversityGroup));
  const winner = eligible[0] || null;
  const runnerUp = eligible[1] || null;
  const margin = score(input.superiorityMargin ?? 0.05, 'superiorityMargin');
  if (!winner || (runnerUp && winner.score - runnerUp.score < margin)) return null;
  return winner;
}

function selectCompetitivePartner(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (candidates.length < 2) throw invalid('At least two candidates are required for a competition.');
  const trials = verifiedTrials(input, candidates, record(input.budget, 'budget'));
  if (trials.length < 2) return { champion: null, trials, replacementAuthorized: false };
  const champion = championFor(trials, input);
  return { champion, trials, replacementAuthorized: false,
    replacementRequiresSeparateApproval: Boolean(champion) };
}

function planRecruitment(input = {}) {
  const required = [...new Set((Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : []).map((item) => text(item, 'required capability')))];
  const available = new Set(Array.isArray(input.availableCapabilities) ? input.availableCapabilities : []);
  const gaps = required.filter((item) => !available.has(item));
  const requestedPermissions = Array.isArray(input.minimumPermissions) ? input.minimumPermissions : [];
  const allowedPermissions = new Set(Array.isArray(input.allowedPermissions) ? input.allowedPermissions : requestedPermissions);
  const permissions = requestedPermissions.filter((permission) => allowedPermissions.has(permission));
  const excludedPermissions = requestedPermissions.filter((permission) => !allowedPermissions.has(permission));
  const sourceArtifacts = [input.dna, input.plasmid, input.fossil].filter(Boolean)
    .filter((artifact) => typeof input.verifySourceArtifact === 'function' && input.verifySourceArtifact(artifact) === true);
  const contract = gaps.length ? { capabilities: gaps, permissions, excludedPermissions,
    evidenceRequired: true, trialRequired: true, sourceArtifacts } : null;
  return { gaps, status: gaps.length ? 'CONTRACT_AND_ADMISSION_REQUIRED' : 'COVERED', contract,
    admissionRequired: gaps.length > 0, autoAssimilate: false };
}

function createProofHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function runEcologicalCycle(input = {}) {
  return require('./adaptiveMicrobiomeRuntimeService').runEcologicalCycle(input);
}

function simulateEcologyCondition(result) {
  return !result || typeof result !== 'object' || Array.isArray(result);
}

function simulateEcologyCondition2(cycles) {
  return !Number.isInteger(cycles) || cycles < 1 || cycles > 20;
}

function ecologyAction(history, last, input) {
  return history.some((item) => item.dysbiosis) ? 'QUARANTINE_AND_REVIEW'
    : last.diversity < Number(input.diversityFloor ?? 2) ? 'ACQUIRE_CANDIDATE'
    : history.some((item, index) => index > 0 && item.fitness < history[index - 1].fitness) ? 'REVIEW_CONTRIBUTORS'
      : 'CONTINUE';
}

module.exports = { assessOrganelle, testOrganelleEssentiality, assessEcology, simulateEcology, planPlacement, planMemory,
  selectCompetitivePartner, authorizeCompetitiveReplacement, planRecruitment, reviewImmuneThreat: reviewThreat,
  reviewImmuneThreatBatch: reviewThreatBatch, validateToolManifest, validateToolInvocation, authorizeToolInvocation,
  executeToolInvocation, reconcileEdgeEvents, simulateEdgeSynchronization, planRegeneration, simulateRegeneration,
  planPlacementBatch, createProofHash, runEcologicalCycle };
