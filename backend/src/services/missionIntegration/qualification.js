'use strict';
const { normalizeCanonical, digest, fail } = require('./contract');
const store = require('./receiptStore');

async function verifyResearch(db, receipt) {
  const record = await require('../endogenousThoughtMissionService').read(db, {
    organizationId: receipt.organizationId, projectId: receipt.projectId, missionId: receipt.missionId,
    agentId: receipt.orchestratorId, receiptId: receipt.research.receiptId });
  if (digest(record) !== receipt.research.digest || record.terminalState !== 'STOPPED'
    || !record.receiptRefs.memory || record.boundaries.promotionEligible !== false) {
    throw fail('MISSION_MECHANISMS_RESEARCH_RECEIPT_INVALID');
  }
  return record;
}
async function verifyAgow(db, receipt) {
  const frame = await require('../agow/workspaceFrameStore').get({ db, agentId: receipt.orchestratorId,
    frameId: receipt.agow.frame.frameId });
  if (!frame || frame.realityMode !== 'real' || frame.primaryContent !== receipt.agow.candidateId) {
    throw fail('MISSION_MECHANISMS_AGOW_FRAME_MISSING');
  }
  const modes = await require('../agow/cognitiveModeExperienceService').load({ db, agentId: receipt.orchestratorId });
  const decision = modes.state.receipts?.find(r => r.receiptId === receipt.agow.modeReceipt.receiptId);
  if (decision?.frameId !== frame.frameId || digest(decision.decision) !== digest(receipt.agow.modeReceipt.decision)) {
    throw fail('MISSION_MECHANISMS_AGOW_DECISION_CHANGED');
  }
}
async function verifyEcology(db, receipt) {
  const row = await db.get('SELECT agent_id,state_json FROM agent_phenotype_states WHERE id=?', receipt.nce.result.phenotype.stateId);
  if (row?.agent_id !== receipt.orchestratorId || JSON.parse(row.state_json).branches.length < receipt.nce.result.phenotype.branchCount) {
    throw fail('MISSION_MECHANISMS_NCE_STATE_MISSING');
  }
}
async function verifyPreparation(db, input) {
  const receipt = input.receipt;
  if (!store.authenticated(receipt)) throw fail('MISSION_MECHANISMS_RECEIPT_INVALID');
  const owner = await db.get(`SELECT a.workspace_id,w.organization_id,w.project_id FROM agents a
    JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=?`, receipt.orchestratorId);
  if (owner?.workspace_id !== receipt.workspaceId || owner.organization_id !== receipt.organizationId
    || owner.project_id !== receipt.projectId) throw fail('MISSION_MECHANISMS_SCOPE_CHANGED');
  const research = await verifyResearch(db, receipt);
  const contextText = await require('./contextChannel').verify(db, { receipt });
  if (!contextText.includes(receipt.research.context.contextText) || digest(contextText) !== receipt.contextDigest) {
    throw fail('MISSION_MECHANISMS_CONTEXT_CHANGED');
  }
  await verifyAgow(db, receipt);
  await verifyEcology(db, receipt);
  return { research, contextText };
}
async function finalArtifact(db, input) {
  const row = await db.get('SELECT record_json FROM gqel_final_artifacts WHERE team_run_id=?', input.run.teamRunId);
  const record = row && JSON.parse(row.record_json);
  const worker = input.workers.find(w => w.runId === record?.executionRunId);
  if (!require('../qualityElevation/qualityReceiptIntegrity').authenticated(record) || record.teamRunId !== input.run.teamRunId
    || record.memberId !== input.run.finalArtifactMemberId || record.qualitySatisfied !== true
    || record.qualityReceiptId !== worker?.qualityReceiptId || record.artifactDigest !== worker?.qualityArtifactDigest) {
    throw fail('MISSION_MECHANISMS_FINAL_QUALITY_REQUIRED');
  }
  return { artifactDigest: record.artifactDigest, executionRunId: record.executionRunId, qualityReceiptId: record.qualityReceiptId };
}
async function executeQualification(db, run) {
  const value = normalizeCanonical(run.missionMechanisms);
  const receipt = await store.get(db, { receiptId: value.receiptRef, missionId: run.execution.runtimeMissionId,
    orchestratorId: run.missionId });
  if (digest(receipt) !== value.receiptDigest || digest(receipt.contract) !== value.contractDigest
    || receipt.contextDigest !== value.contextDigest) throw fail('MISSION_MECHANISMS_CANONICAL_CHANGED');
  const preparation = await verifyPreparation(db, { receipt });
  const workers = [];
  for (const member of run.members) workers.push(await require('./workerQualification').qualifyWorker(db,
    { member, receipt, contextText: preparation.contextText }));
  if (!workers.length) throw fail('MISSION_MECHANISMS_WORKERS_REQUIRED');
  const morph = await require('../aTeam/adaptation/liveMorphogenesisReceipt').verify(db, run);
  const graph = await require('../aTeam/workGraph/workGraphStore').load(db, run.workGraphId);
  const relational = await require('../aTeam/relational/handoffQualification').qualify(db, { run, observed: { graph } });
  if (!relational.required || !relational.passed) throw fail('MISSION_MECHANISMS_RPE_REQUIRED');
  const final = await finalArtifact(db, { run, workers });
  return { required: true, passed: true, receiptRef: receipt.receiptId, contextDigest: receipt.contextDigest,
    researchReceiptId: preparation.research.receiptId, workers, MORPH: morph, relational, final,
    boundaries: receipt.boundaries };
}
async function qualify(db, run) {
  if (!run.missionMechanisms) return { required: false, passed: true };
  try { return await executeQualification(db, run); }
  catch (error) { return { required: true, passed: false, reasons: [error.code || error.message] }; }
}
module.exports = { qualify, verifyPreparation };
