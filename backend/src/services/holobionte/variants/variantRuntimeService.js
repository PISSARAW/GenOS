'use strict';

const { createHash } = require('crypto');
const { detectDysbiosis } = require('../health/dysbiosisDetector');
const { validateToolManifest, validateToolInvocation } = require('./toolRuntimeService');
const { reconcileEdgeEvents } = require('./edgeSyncRuntimeService');
const { reviewThreat } = require('./immuneThreatRuntimeService');
const { planRegeneration } = require('./regenerationRuntimeService');

function invalid(message, code = 'HOLOBIONT_VARIANT_RUNTIME_INVALID') {
  return Object.assign(new Error(message), { code });
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object.`);
  return value;
}

function text(value, field) {
  const result = String(value || '').trim();
  if (!result) throw invalid(`${field} is required.`);
  return result;
}

function evidence(value, field = 'evidenceRefs') {
  const refs = Array.isArray(value) ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))] : [];
  if (!refs.length) throw invalid(`${field} must contain evidence references.`, 'HOLOBIONT_EVIDENCE_REQUIRED');
  return refs;
}

function score(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 1) throw invalid(`${field} must be between 0 and 1.`);
  return result;
}

function sameBudget(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && Number(left[key]) === Number(right[key]));
}

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

function assessOrganelle(input = {}) {
  const graph = record(input.dependencyGraph, 'dependencyGraph');
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const core = new Set(nodes.filter((node) => node.core === true).map((node) => text(node.id, 'core id')));
  const dependents = [...new Set(edges.filter((edge) => core.has(edge.target)).map((edge) => text(edge.source, 'dependent id')))];
  const replacementRequested = input.replacementRequested === true;
  const replacementAllowed = replacementGate(input, core);
  return { coreSymbiontIds: [...core], dependentSymbiontIds: dependents,
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

function ecologyAction(dysbiosis, diversity, floor) {
  if (dysbiosis) return 'QUARANTINE_AND_REVIEW';
  return diversity < floor ? 'ACQUIRE_CANDIDATE' : 'CONTINUE';
}

function assessEcology(input = {}) {
  const { floor, diversity } = ecologyInputs(input);
  const samples = ecologySamples(Array.isArray(input.fitnessHistory) ? input.fitnessHistory : []);
  const dysbiosis = input.dysbiosisSignals
    ? detectDysbiosis(input.dysbiosisSignals).state === 'ALERT' : false;
  return { longitudinalSamples: samples.length, fitnessDelta: fitnessDelta(samples),
    action: ecologyAction(dysbiosis, diversity, floor),
    diversityFloor: floor, diversity, automaticReplacement: false };
}

function placementVariant(input) {
  const requirement = String(input.variantId || 'local-first');
  const edgeCore = requirement === 'edge-core/cloud-symbionts';
  const localOnly = requirement === 'local-first' || edgeCore;
  const wantsCloudCore = requirement === 'cloud-core/edge-symbionts' || requirement === 'cloud-core/edge-sync';
  return { requirement, edgeCore, wantsCloudCore, localOnly,
    requireConnectedEdge: requirement === 'cloud-core/edge-symbionts',
    requireAsyncSync: requirement === 'cloud-core/edge-sync' };
}

function availableEngines(input) {
  return new Set(Array.isArray(input.availableEngines) ? input.availableEngines : []);
}

function requestedHost(input, variant) {
  if (variant.localOnly || input.offline === true) return 'local';
  return variant.wantsCloudCore ? 'cloud' : input.preferredEngine || 'local';
}

function verifyFallback(input, engines) {
  return input.allowLocalFallback === true && typeof input.verifyLocalFallback === 'function'
    && input.verifyLocalFallback() === true && engines.has('local');
}

function chooseHost(context) {
  const { input, variant, engines } = context;
  const target = requestedHost(input, variant);
  const verifiedFallback = verifyFallback(input, engines);
  const host = engines.has(target) ? target : verifiedFallback ? 'local' : target;
  return { requestedHost: target, host, fallback: host === target ? null : 'local' };
}

function placementGuards(context) {
  const { input, variant, placement, engines } = context;
  const classes = Array.isArray(input.dataClasses) ? input.dataClasses : [];
  const restricted = new Set(Array.isArray(input.restrictedDataClasses) ? input.restrictedDataClasses : []);
  const remoteNeeded = needsRemoteExecutor(input, variant, placement);
  const engineReady = hasRequiredEngines({ input, variant, placement, engines });
  const privacyBlocked = blocksRemoteData({ input, classes, restricted, remoteNeeded });
  const cloudSymbionts = usesEdgeSymbionts(variant, placement);
  const leaseValid = !cloudSymbionts || edgeLeaseAllowed(input.edgeLease, input.verifyEdgeLease, input.requiredEdgeCapability);
  const edgeReady = !cloudSymbionts || variant.requireConnectedEdge !== true || input.edgeConnected === true;
  const remoteReady = remoteExecutorHealthy(input, variant);
  return { classes, restricted, remoteNeeded, engineReady, privacyBlocked, leaseValid, edgeReady, remoteReady, cloudSymbionts };
}

function remoteExecutorHealthy(input, variant) {
  if (!variant.edgeCore || input.requiresRemoteCapability !== true) return true;
  return typeof input.verifyCloudConnectivity === 'function'
    && input.verifyCloudConnectivity(input.connectivityReceipt) === true;
}

function needsRemoteExecutor(input, variant, placement) {
  return placement.host !== 'local' || (variant.edgeCore && input.requiresRemoteCapability === true);
}

function hasRequiredEngines(context) {
  const { input, variant, placement, engines } = context;
  const localHostReady = engines.has(placement.host);
  if (!variant.edgeCore || input.requiresRemoteCapability !== true) return localHostReady;
  return localHostReady && engines.has('cloud');
}

function blocksRemoteData(context) {
  const { input, classes, restricted, remoteNeeded } = context;
  return remoteNeeded && input.redacted !== true && classes.some((item) => restricted.has(item));
}

function usesEdgeSymbionts(variant, placement) {
  return variant.wantsCloudCore && placement.host === 'cloud';
}

function placementReason(guards) {
  if (!guards.engineReady) return 'ENGINE_UNAVAILABLE';
  if (guards.privacyBlocked) return 'PRIVACY_REDACTION_REQUIRED';
  if (!guards.leaseValid) return 'EDGE_LEASE_REQUIRED';
  if (!guards.edgeReady) return 'EDGE_UNAVAILABLE';
  if (!guards.remoteReady) return 'REMOTE_CONNECTIVITY_UNVERIFIED';
  return null;
}

function placementResult(context) {
  const { input, variant, placement, guards } = context;
  const dataClasses = !guards.remoteNeeded ? guards.classes
    : input.redacted === true ? guards.classes.filter((item) => !guards.restricted.has(item)) : guards.classes;
  const symbionts = variant.edgeCore && input.requiresRemoteCapability === true ? 'cloud-on-demand'
    : guards.cloudSymbionts ? 'edge' : placement.host;
  const exportProof = placement.host === 'local' && !guards.remoteNeeded && typeof input.attestNoExport === 'function'
    ? input.attestNoExport({ dataClasses: guards.classes }) : null;
  return { accepted: placementReason(guards) === null, host: placement.host, requestedHost: placement.requestedHost,
    symbionts, fallback: placement.fallback, dataClasses,
    pendingSync: variant.requireAsyncSync === true && input.edgeConnected !== true,
    reason: placementReason(guards),
    exportProof };
}

function planPlacement(input = {}) {
  const variant = placementVariant(input);
  const engines = availableEngines(input);
  const context = { input, variant, engines };
  context.placement = chooseHost(context);
  context.guards = placementGuards(context);
  return placementResult(context);
}

function edgeLeaseAllowed(lease, verifier, requiredCapability) {
  return Boolean(lease && typeof verifier === 'function' && verifier(lease) === true
    && lease.leaseId && lease.deviceId && Date.parse(lease.expiresAt) > Date.now()
    && Array.isArray(lease.capabilities) && lease.capabilities.includes(requiredCapability));
}

function addMemory(context, memory) {
  const { conflicts, byKey } = context;
  const item = record(memory, 'memory');
  text(item.id, 'memory.id');
    if (item.memoryType === 'PROCEDURAL' && item.procedureVerified !== true) {
      throw invalid('Procedural memory requires a verified procedure.', 'HOLOBIONT_PROCEDURE_UNVERIFIED');
    }
  const refs = evidence(item.evidenceRefs);
  const key = text(item.conceptKey, 'memory.conceptKey');
  const current = byKey.get(key);
  if (current && JSON.stringify(current.value) !== JSON.stringify(item.value)) conflicts.push({ conceptKey: key, memoryIds: [current.id, item.id] });
  const fitness = score(item.fitness, 'memory.fitness');
  if (!current || fitness > current.fitness) byKey.set(key, { id: item.id, value: item.value, fitness, evidenceRefs: refs });
}

function planMemory(input = {}) {
  const context = { conflicts: [], byKey: new Map() };
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
  const winner = trials[0] || null;
  const runnerUp = trials[1] || null;
  const margin = score(input.superiorityMargin ?? 0.05, 'superiorityMargin');
  const diverse = winner && input.protectedGroups?.includes(winner.diversityGroup);
  if (!winner || (runnerUp && winner.score - runnerUp.score < margin)) return null;
  return diverse || input.allowGroupChangeVerified === true ? winner : null;
}

function selectCompetitivePartner(input = {}) {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  if (candidates.length < 2) throw invalid('At least two candidates are required for a competition.');
  const trials = verifiedTrials(input, candidates, record(input.budget, 'budget'));
  if (trials.length < 2) return { champion: null, trials, replacementAuthorized: false };
  const champion = championFor(trials, input);
  const replacementAuthorized = Boolean(champion && typeof input.approveReplacement === 'function'
    && input.approveReplacement(champion.id) === true);
  return { champion, trials, replacementAuthorized };
}

function planRecruitment(input = {}) {
  const required = [...new Set((Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities : []).map((item) => text(item, 'required capability')))];
  const available = new Set(Array.isArray(input.availableCapabilities) ? input.availableCapabilities : []);
  const gaps = required.filter((item) => !available.has(item));
  const contract = gaps.length ? { capabilities: gaps, permissions: input.minimumPermissions || [],
    evidenceRequired: true, trialRequired: true, sourceArtifacts: (input.dna || input.plasmid || input.fossil) ? [input.dna, input.plasmid, input.fossil].filter(Boolean) : [] } : null;
  return { gaps, status: gaps.length ? 'CONTRACT_AND_ADMISSION_REQUIRED' : 'COVERED', contract, autoAssimilate: false };
}

function createProofHash(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

module.exports = { assessOrganelle, testOrganelleEssentiality, assessEcology, planPlacement, planMemory,
  selectCompetitivePartner, planRecruitment, reviewImmuneThreat: reviewThreat, validateToolManifest,
  validateToolInvocation, reconcileEdgeEvents, planRegeneration, createProofHash };
