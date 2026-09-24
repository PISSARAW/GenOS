'use strict';

const store = require('../holobiontStore');
const resources = require('../resources/symbioticResourceService');
const contributions = require('../fitness/symbiontContributionService');
const memory = require('../memory/symbioticMemoryService');

function requireExecutor(value) {
  if (typeof value !== 'function') throw Object.assign(new Error('A capability executor is required.'), { code: 'HOLOBIONT_EXECUTOR_REQUIRED' });
  return value;
}

function verifiedResult(output) {
  if (!output || output.verification?.status !== 'VERIFIED' || !Array.isArray(output.verification.evidenceRefs)
    || !output.verification.evidenceRefs.length) {
    throw Object.assign(new Error('Capability execution requires a verified evidence receipt.'), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  }
  return output;
}

function contributionInput(context) {
  const { plan, allocation, output, input } = context;
  return {
    holobiontId: plan.session.holobiontId, expectedSessionRevision: allocation.sessionRevision,
    symbiontId: plan.resident.id, capability: plan.capability,
    receiptId: output.receiptId, verification: output.verification,
    benefitScore: output.benefitScore, evidenceQuality: output.evidenceQuality,
    costScore: output.costScore, riskScore: output.riskScore,
    resourcesConsumed: output.resourcesConsumed || allocation.resources,
    hostInterventions: output.hostInterventions || 0, failures: output.failures || 0,
    falseAlerts: output.falseAlerts || 0, selfVerified: output.selfVerified === true,
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
    authorId: record.verifierId, riskScore: record.riskScore, selfVerified: input.selfVerified === true
  });
}

async function revokeAllocation(context) {
  const { db, plan, input, reason } = context;
  const session = await store.getSession(db, plan.session.holobiontId);
  if (!session.resourceState.allocations?.[plan.resident.id]) return;
  await resources.revokeResources(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    symbiontId: plan.resident.id, reason, actorId: input.actorId
  });
}

async function executeCapability(db, plan, input = {}) {
  const execute = requireExecutor(input.executeCapability);
  const allocation = await resources.grantResources(db, {
    ...input.allocation, holobiontId: plan.session.holobiontId,
    expectedSessionRevision: plan.session.revision, symbiontId: plan.resident.id, actorId: input.actorId
  });
  try {
    const raw = await execute({ capability: plan.capability, contract: plan.contract,
      resident: plan.resident, allocation, session: plan.session });
    const output = verifiedResult(raw);
    const record = await contributions.recordContribution(db, contributionInput({ plan, allocation, output, input }));
    if (record.accepted === false) {
      await revokeAllocation({ db, plan, input, reason: 'RUNTIME_CONTRIBUTION_REJECTED' });
      return { accepted: false, contribution: record, allocation };
    }
    const consolidatedMemory = await storeMemory({ db, plan, record, input });
    if (consolidatedMemory.accepted === false) {
      await revokeAllocation({ db, plan, input, reason: 'RUNTIME_MEMORY_REJECTED' });
      return { accepted: false, contribution: record, allocation, memory: consolidatedMemory };
    }
    return { accepted: true, allocation, contribution: record, memory: consolidatedMemory };
  } catch (error) {
    await revokeAllocation({ db, plan, input, reason: 'RUNTIME_EXECUTION_FAILED' });
    throw error;
  }
}

module.exports = { executeCapability };
