'use strict';

const { withTransaction } = require('../../../db');
const store = require('../holobiontStore');
const resources = require('../resources/symbioticResourceService');
const contributions = require('../fitness/symbiontContributionService');
const memory = require('../memory/symbioticMemoryService');
const policy = require('./capabilityExecutionPolicy');

function contributionInput(context) {
  const { plan, allocation, output, input } = context;
  return {
    holobiontId: plan.session.holobiontId, expectedSessionRevision: allocation.sessionRevision,
    symbiontId: plan.resident.id, capability: plan.capability,
    receiptId: output.receiptId, verification: output.verification,
    benefitScore: output.benefitScore, evidenceQuality: output.evidenceQuality,
    costScore: output.costScore, riskScore: output.riskScore,
    resourcesConsumed: output.resourcesConsumed,
    hostInterventions: output.hostInterventions || 0, failures: output.failures || 0,
    falseAlerts: output.falseAlerts || 0, selfVerified: false,
    dataClasses: input.dataClasses || [], actorId: input.actorId
  };
}

async function storeMemory(context) {
  const { db, plan, record, input } = context;
  const session = await store.getSession(db, plan.session.holobiontId);
  return memory.recordMemory(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    memoryType: 'EPISODIC', scope: session.scope,
    content: { type: 'VERIFIED_SYMBIOTIC_EXECUTION', capability: plan.capability,
      symbiontId: plan.resident.id, contributionScore: record.contributionScore,
      resultHash: record.resultHash },
    evidenceRefs: record.evidenceRefs, dataClasses: input.dataClasses || [],
    authorId: record.verifierId, riskScore: record.riskScore, selfVerified: false
  });
}

function accepted(record) {
  if (record.accepted === false) throw Object.assign(policy.invalid('Execution persistence rejected.'), { rejection: record });
  return record;
}

async function persistExecution(db, context) {
  return withTransaction(db, async (tx) => {
    context.input.signal?.throwIfAborted();
    await policy.confirmContract(tx, context.plan);
    const record = accepted(await contributions.recordContribution(tx, contributionInput(context)));
    const consolidatedMemory = accepted(await storeMemory({ ...context, db: tx, record }));
    context.input.signal?.throwIfAborted();
    const session = await store.getSession(tx, context.plan.session.holobiontId);
    await store.appendEvent(tx, { holobiontId: session.holobiontId,
      expectedRevision: session.revision, eventType: 'CAPABILITY_USED', actorId: context.input.actorId,
      payload: { missionId: context.input.missionId || session.missionId, symbiontId: context.plan.resident.id, capability: context.plan.capability,
        receiptId: record.receiptId, resultHash: record.resultHash,
        evidenceRefs: record.evidenceRefs, hostDecision: context.hostDecision } });
    return { accepted: true, result: context.output.result, allocation: context.allocation,
      contribution: record, memory: consolidatedMemory, hostDecision: context.hostDecision };
  });
}

async function releaseAllocation(db, context) {
  const { plan, allocation, input } = context;
  const session = await store.getSession(db, plan.session.holobiontId);
  const current = session.resourceState.allocations?.[plan.resident.id];
  if (current?.allocationId !== allocation.allocationId) return;
  await resources.revokeResources(db, { holobiontId: session.holobiontId,
    expectedSessionRevision: session.revision, symbiontId: plan.resident.id,
    allocationId: allocation.allocationId, reason: 'RUNTIME_EXECUTION_FINISHED', actorId: input.actorId });
}

async function rejectOutput(db, context) {
  const session = await store.getSession(db, context.plan.session.holobiontId);
  await store.appendEvent(db, { holobiontId: session.holobiontId,
    expectedRevision: session.revision, eventType: 'IMMUNE_REJECTION', actorId: context.input.actorId,
    payload: { symbiontId: context.plan.resident.id, resultHash: context.output.verification.resultHash,
      evidenceRefs: context.output.verification.evidenceRefs, hostDecision: context.hostDecision } });
  return { accepted: false, reason: 'HOST_VETO', hostDecision: context.hostDecision, allocation: context.allocation };
}

async function executeAllocated(db, context) {
  const { plan, allocation, input } = context;
  input.signal?.throwIfAborted();
  const invocation = structuredClone({ capability: plan.capability, contract: plan.contract,
    resident: plan.resident, allocation, session: plan.session,
    request: input.request, workerResults: input.workerResults });
  const raw = await input.executeCapability({ ...invocation, signal: input.signal });
  input.signal?.throwIfAborted();
  const output = await policy.verifyOutput(raw, context);
  input.signal?.throwIfAborted();
  const hostDecision = await policy.authorizeOutput(db, { ...context, output });
  if (!hostDecision.allowed) return rejectOutput(db, { ...context, output, hostDecision });
  input.signal?.throwIfAborted();
  return persistExecution(db, { ...context, output, hostDecision });
}

async function executeCapability(db, plan, input = {}) {
  input.signal?.throwIfAborted();
  await policy.authorizeExecution(db, plan, input);
  const allocation = await resources.grantResources(db, {
    ...input.allocation, holobiontId: plan.session.holobiontId,
    expectedSessionRevision: plan.session.revision, symbiontId: plan.resident.id, actorId: input.actorId
  });
  const context = { plan, allocation, input };
  try {
    return await executeAllocated(db, context);
  } catch (error) {
    if (error.rejection) return { accepted: false, reason: 'PERSISTENCE_REJECTED', rejection: error.rejection, allocation };
    throw error;
  } finally {
    await releaseAllocation(db, context);
  }
}

module.exports = { executeCapability };
