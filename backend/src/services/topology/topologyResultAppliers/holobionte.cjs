'use strict';

const workerReader = require('../workerResultReader.cjs');
const workerResults = require('../../morphogenesis/runtime/topologyWorkerResults');
const bridge = require('../../holobionte/runtime/workerMissionAdapters');
const runtime = require('../../holobionte/runtime/holobiontMissionService');

function expectedWorkers(composition) {
  return (composition?.members || []).filter((member) => member.executionMode !== 'orchestrator');
}

function verifiedWorker(member) {
  return member?.status === 'completed' && Boolean(member.executionRunId)
    && member.result?.status === 'completed' && member.result?.verified === true;
}

function workerBarrier(input, expected) {
  const accepted = input.accepted || [];
  return expected.length > 0 && accepted.length === expected.length
    && accepted.every(verifiedWorker) && !(input.context?.dispatchFailures || []).length;
}

async function persistedWorkerResult(db, missionId, member) {
  const evidence = await workerReader.readEvidence(db, { missionId, member,
    executionRunId: member.executionRunId });
  const valid = evidence.valid && evidence.receipt?.result?.status === 'completed'
    && evidence.receipt?.result?.verified === true;
  if (!valid) return null;
  return { ...member, evidenceReport: evidence.receipt.evidence.report };
}

async function loadWorkerResults(input) {
  const loaded = await Promise.all(input.accepted.map((member) =>
    persistedWorkerResult(input.db, input.context.missionId, member)));
  if (loaded.some((item) => !item)) return null;
  return workerResults.collectTopologyWorkerResults(input.accepted, { workerResults: loaded });
}

function requestValue(context, key) {
  return context?.request?.holobionte?.[key] ?? context?.request?.[key];
}

function runtimeDependencies(context) {
  const supplied = context?.holobionteRuntimeDependencies || {};
  return Object.fromEntries(['executeCapability', 'verifyCapability', 'trialCapabilityExecutor']
    .filter((name) => typeof supplied[name] === 'function')
    .map((name) => [name, supplied[name]]));
}

function runtimeInput(input, results) {
  const capability = String(requestValue(input.context, 'capability') || '').trim();
  const hostId = input.composition?.hostSession?.hostId || input.parent?.id
    || input.context?.orchestratorId;
  const adapters = bridge.missionAdapters(runtimeDependencies(input.context), results);
  const symbionts = requestValue(input.context, 'symbionts') || [{ id: 'resident-mission',
    contract: bridge.contractBody({ hostId }, capability) }];
  return { hostId, missionId: input.context.missionId,
    holobiontId: input.topology?.holobiontId || input.composition?.holobiontId,
    capability, allocation: requestValue(input.context, 'allocation'),
    budget: input.context.request.execution_budget || input.context.request.executionBudget,
    actorId: input.context.orchestratorId, symbionts, ...adapters };
}

function missingConfiguration(input) {
  if (!String(requestValue(input.context, 'capability') || '').trim()) return 'HOLOBIONT_CAPABILITY_REQUIRED';
  if (!requestValue(input.context, 'allocation')) return 'HOLOBIONT_ALLOCATION_REQUIRED';
  return null;
}

async function apply(input = {}) {
  const expected = expectedWorkers(input.composition);
  if (!workerBarrier(input, expected)) return { applied: false, status: 'BLOCKED',
    reason: 'HOLOBIONT_VERIFIED_WORKER_EVIDENCE_REQUIRED' };
  const configurationError = missingConfiguration(input);
  if (configurationError) return { applied: false, status: 'BLOCKED', reason: configurationError };
  const results = await loadWorkerResults(input);
  if (!results) return { applied: false, status: 'BLOCKED',
    reason: 'HOLOBIONT_VERIFIED_WORKER_EVIDENCE_REQUIRED' };
  const result = await runtime.runHolobiontMission(input.db, runtimeInput(input, results));
  return { holobiontId: result.holobiontId, runtimeStatus: result.status,
    sessionStatus: result.sessionStatus, sessionClosed: result.sessionClosed,
    hostReused: result.hostReused, admissions: result.admissions,
    workerResultCount: results.length };
}

module.exports = { apply, loadWorkerResults, workerBarrier };
