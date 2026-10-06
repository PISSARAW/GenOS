'use strict';

const { methodInput, error, text, list, resultReport } = require('./workerNativeEvidence');
const { assertActive } = require('./workerNativeLifecycle');
const CHILD_KINDS = new Set(['scout_cell', 'bounded_worker', 'adaptive_worker', 'verifier_worker']);

function validItem(item) {
  return text(item?.sourceRef, 256) && text(item.summary, 2048);
}

function assertHandoffInput(method) {
  const input = methodInput(method, 'prepare_handoff');
  if (!text(input.sourceGroup, 128) || !text(input.targetGroup, 128) || input.sourceGroup === input.targetGroup) {
    throw error('WORKER_HANDOFF_INPUT_INVALID', 'Distinct source and recipient groups are required.');
  }
  if (!list(input.items, validItem, 32)) throw error('WORKER_HANDOFF_INPUT_INVALID', 'Use 1-32 referenced handoff items.');
  return true;
}

function runHandoff(method) {
  assertHandoffInput(method);
  const input = method.parameters;
  const deliveredRefs = [...new Set(input.items.map((item) => item.sourceRef))];
  const handoff = { sourceGroup: input.sourceGroup, targetGroup: input.targetGroup, deliveredRefs,
    items: input.items, delivery: 'parent_dossier', recipientAcknowledged: false };
  return resultReport(method, { handoff }, { type: 'dossier',
    statement: `Recipient-bound handoff prepared for '${input.targetGroup}'; delivered in the parent dossier; recipient acknowledgement pending.`,
    sourceRefs: deliveredRefs });
}

function validChild(child) {
  return CHILD_KINDS.has(child?.workerKind) && text(child.mission, 12000)
    && child.methodContract?.version === 1;
}

function assertCoordinationInput(method) {
  const input = methodInput(method, 'coordinate_children');
  if (!list(input.children, validChild, 5)) {
    throw error('WORKER_COORDINATION_INPUT_INVALID', 'Use 1-5 allowed children with explicit method contracts.');
  }
  const kinds = require('./workerKindService');
  const registry = require('./workerExecutorRegistry');
  for (const child of input.children) {
    kinds.assertMethodCompatibility(child.workerKind, child.methodContract);
    if (!registry.hasNativeMethod(child.workerKind, child.methodContract.methodId)) {
      throw error('WORKER_EXECUTOR_UNAVAILABLE', 'Native coordination requires executable child methods.');
    }
    registry.assertNativeInput(child.workerKind, child.methodContract);
  }
  return true;
}

async function runCoordination(method, context) {
  assertCoordinationInput(method);
  const { db, mission } = context;
  const dispatch = require('./subOrchestratorDispatchService').dispatchSubOrchestratorWorker;
  const summaries = [];
  for (const child of method.parameters.children) {
    assertActive(context);
    const timeoutMs = Math.max(1, Math.min(60000, context.deadline - Date.now()));
    const result = await dispatch(db, mission.agentId, { ...child, timeoutMs });
    assertActive(context);
    if (!result.success || result.supervision?.success !== true) {
      throw error('WORKER_CHILD_FAILED', `Child '${result.childAgentId}' did not provide verified completion.`);
    }
    const refs = result.supervision.evidenceReport.workerArtifact.provenance.sourceRefs;
    summaries.push({ childId: result.childAgentId, outcome: 'success', evidence: refs });
  }
  return resultReport(method, { childSummaries: summaries }, { type: 'dossier',
    statement: `${summaries.length} persisted children completed with validated evidence.`,
    sourceRefs: summaries.flatMap((item) => item.evidence) });
}

module.exports = { assertHandoffInput, runHandoff, assertCoordinationInput, runCoordination };
