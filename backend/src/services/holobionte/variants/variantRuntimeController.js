'use strict';

const { createHash, randomUUID } = require('crypto');
const store = require('../holobiontStore');
const variants = require('./index');
const runtime = require('./variantRuntimeService');
const { createWorkflowRunner } = require('./variantWorkflowService');
const admission = require('../symbionts/symbiontAdmissionService');
const contracts = require('../contracts/symbiosisContractService');

const PROCEDURAL_OPERATIONS = Object.freeze({
  createSymbiosisContract: contracts.createContract,
  startSymbiontAdmission: admission.startAdmission,
  evaluateSymbiontTrial: admission.evaluateTrial
});

const OPERATIONS = Object.freeze({
  organelle: ['assessOrganelle', 'testOrganelleEssentiality'],
  'adaptive-microbiome': ['assessEcology', 'simulateEcology', 'planRecruitment', 'selectCompetitivePartner', 'authorizeCompetitiveReplacement', 'runEcologicalCycle'],
  'immune-critical': ['reviewImmuneThreat', 'reviewImmuneThreatBatch'],
  'local-first': ['planPlacement', 'planPlacementBatch'],
  'regenerative': ['planRegeneration', 'simulateRegeneration'],
  'cloud-core/edge-symbionts': ['planPlacement', 'planPlacementBatch', 'reconcileEdgeEvents', 'simulateEdgeSynchronization'],
  'edge-core/cloud-symbionts': ['planPlacement', 'planPlacementBatch'],
  'memory-rich': ['planMemory'],
  'competitive-partner': ['selectCompetitivePartner', 'authorizeCompetitiveReplacement'],
  'procedural': ['planRecruitment', 'createSymbiosisContract', 'startSymbiontAdmission', 'evaluateSymbiontTrial'],
  'tool': ['validateToolManifest', 'validateToolInvocation', 'authorizeToolInvocation', 'executeToolInvocation'],
  'cloud-core/edge-sync': ['planPlacement', 'planPlacementBatch', 'reconcileEdgeEvents', 'simulateEdgeSynchronization']
});

function error(message, code) {
  return Object.assign(new Error(message), { code });
}

function requireRevision(input, session) {
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw error('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  }
}

function snapshot(policy) {
  return { host: policy.configureHost(), admission: policy.configureAdmission(),
    resources: policy.configureResources(), immune: policy.configureImmunePolicy(),
    transmission: policy.configureTransmission(), succession: policy.configureSuccession(),
    stopConditions: policy.configureStopConditions(), placement: policy.configurePlacement(),
    memory: policy.configureMemory(), competition: policy.configureCompetition(),
    tool: policy.configureTool(), synchronization: policy.configureSynchronization() };
}

function fitPolicy(policy, context) {
  const fit = policy.analyzeFit(context || {});
  if (!fit.compatible) throw Object.assign(error(`Variant requires: ${fit.reasons.join(', ')}.`, 'HOLOBIONT_VARIANT_INCOMPATIBLE'), { details: fit });
  return fit;
}

async function selectPersistentVariant(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw error('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  requireRevision(input, session);
  const policy = variants.getVariant(input.variantId);
  const fit = fitPolicy(policy, input.fitContext);
  const current = session.variantState?.variantId;
  if (current && current !== policy.name && (typeof input.approveChange !== 'function' || input.approveChange(current, policy.name) !== true)) {
    throw error('Changing a persistent Host variant requires an approved transition.', 'HOLOBIONT_VARIANT_CHANGE_REQUIRES_APPROVAL');
  }
  const selectionReceipt = { receiptId: randomUUID(), variantId: policy.name,
    actorId: input.actorId || null, source: current ? 'approved_transition' : 'operator_selection', fitScore: fit.score };
  const revision = await store.appendEvent(db, { holobiontId: session.holobiontId,
    eventType: 'VARIANT_SELECTED', expectedRevision: session.revision, actorId: input.actorId,
    payload: { variantId: policy.name, policy: snapshot(policy), selectionReceipt, selectedAt: new Date().toISOString() } });
  return { variantId: policy.name, selectionReceipt, sessionRevision: revision };
}

function evidenceRefs(result) {
  const queue = [result];
  const seen = new Set();
  const refs = new Set();
  while (queue.length) {
    const value = queue.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value.evidenceRefs)) value.evidenceRefs.forEach((item) => refs.add(String(item).trim()));
    queue.push(...(Array.isArray(value) ? value : Object.values(value)));
  }
  return [...refs].filter(Boolean);
}

function operationFor(state, operation) {
  const allowed = OPERATIONS[state.variantId] || [];
  const execute = runtime[operation];
  if (!allowed.includes(operation) || typeof execute !== 'function') {
    throw error('Operation is not available for the selected Holobiont variant.', 'HOLOBIONT_VARIANT_OPERATION_FORBIDDEN');
  }
  return execute;
}

async function verifiedResult(result, input, context) {
  const refs = [...new Set([...evidenceRefs(result), ...(Array.isArray(input.evidenceRefs) ? input.evidenceRefs : [])])];
  const verify = input.verifyEvaluationEvidence;
  if (!refs.length || typeof verify !== 'function'
    || await verify({ operation: context.operation, result, evidenceRefs: refs }) !== true) {
    throw error('Variant evaluation requires independently verified evidence.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  }
  return refs;
}

async function evaluatePersistentVariant(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw error('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  requireRevision(input, session);
  const state = session.variantState || {};
  if (!state.variantId) throw error('Select a variant before evaluating it.', 'HOLOBIONT_VARIANT_REQUIRED');
  const execute = operationFor(state, input.operation);
  const runtimeInput = input.runtimeInput || {};
  let result;
  let cyclePayload = null;
  if (input.operation === 'runEcologicalCycle') {
    const policy = variants.getVariant(state.variantId);
    const ecoState = session.ecologicalState || { cycle: 0, fitnessBySymbiont: {}, diversityHistory: [], dysbiosisHistory: [] };
    result = await execute({
      ecologicalState: ecoState,
      policy: { ...policy.configureCompetition(), diversityFloor: 2 },
      residentSymbionts: session.residentSymbionts || [],
      dysbiosisSignals: runtimeInput.dysbiosisSignals,
      requiredCapabilities: runtimeInput.requiredCapabilities,
      minimumPermissions: runtimeInput.minimumPermissions,
      candidates: runtimeInput.candidates,
      budget: runtimeInput.budget,
      protectedGroups: runtimeInput.protectedGroups,
      verifyTrial: runtimeInput.verifyTrial,
      evidenceRefs: runtimeInput.evidenceRefs
    });
    cyclePayload = {
      cycle: result.cycle,
      diversity: result.diversity,
      dysbiosis: result.dysbiosis,
      fitnessBySymbiont: result.fitnessSnapshot,
      recordedAt: new Date().toISOString()
    };
  } else {
    result = await execute({ ...runtimeInput, variantId: state.variantId });
  }
  const refs = await verifiedResult(result, input, { operation: input.operation });
  const receipt = { evaluationId: randomUUID(), variantId: state.variantId, operation: input.operation,
    resultHash: `sha256:${createHash('sha256').update(JSON.stringify(result)).digest('hex')}`,
    evidenceRefs: refs, result, actorId: input.actorId || null, evaluatedAt: new Date().toISOString() };
  if (JSON.stringify(receipt).length > 65536) throw error('Variant evaluation receipt exceeds the persistence limit.', 'HOLOBIONT_VARIANT_RECEIPT_TOO_LARGE');
  const events = cyclePayload ? [{ eventType: 'ECOLOGICAL_CYCLE_COMPLETED', payload: cyclePayload }] : [];
  events.push({ eventType: 'VARIANT_RUNTIME_EVALUATED', payload: receipt });
  const revision = await store.appendEvents(db, { holobiontId: session.holobiontId,
    expectedRevision: session.revision, actorId: input.actorId, events });
  return { receipt, sessionRevision: revision };
}

async function evaluateWorkflowStep(db, input) {
  const execute = PROCEDURAL_OPERATIONS[input.operation];
  if (!execute) return evaluatePersistentVariant(db, input);
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw error('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  requireRevision(input, session);
  if (session.variantState?.variantId !== 'procedural') {
    throw error('Admission lifecycle operations require the procedural variant.', 'HOLOBIONT_VARIANT_OPERATION_FORBIDDEN');
  }
  const result = await execute(db, { ...input, ...(input.runtimeInput || {}),
    holobiontId: input.holobiontId, expectedSessionRevision: input.expectedSessionRevision });
  return { receipt: { operation: input.operation, result },
    sessionRevision: Number.isInteger(result.sessionRevision) ? result.sessionRevision : session.revision };
}

const runPersistentVariantWorkflow = createWorkflowRunner(evaluateWorkflowStep);

async function recordSymbiontFitness(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw error('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  requireRevision(input, session);
  const symbiontId = String(input.symbiontId || '').trim();
  const fitness = Number(input.fitness);
  const cycle = Number(input.cycle);
  if (!symbiontId || !Number.isFinite(fitness) || fitness < 0 || fitness > 1 || !Number.isInteger(cycle) || cycle < 0) {
    throw error('Invalid symbiont fitness input.', 'HOLOBIONT_INVALID_FITNESS_INPUT');
  }
  const revision = await store.appendEvent(db, {
    holobiontId: session.holobiontId,
    eventType: 'SYMBIONT_FITNESS_RECORDED',
    expectedRevision: session.revision,
    actorId: input.actorId,
    payload: { symbiontId, fitness, cycle, recordedAt: new Date().toISOString() }
  });
  return { sessionRevision: revision };
}

module.exports = { selectPersistentVariant, evaluatePersistentVariant, runPersistentVariantWorkflow, recordSymbiontFitness, OPERATIONS };
