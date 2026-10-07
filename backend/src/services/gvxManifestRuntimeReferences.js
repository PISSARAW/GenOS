'use strict';

const values = require('./trinityProvenanceValues');
const runs = require('./gvxMissionProvenance');
const workers = require('./biologicalWorkerStore');
const { error } = require('./gvxContracts');

async function resolve(db, manifest) {
  const source = manifest.payload.provenance;
  if (!source.mission.runtime) return { status: 'declared', postconditions: 'not_evaluated' };
  const scope = manifest.payload.scope;
  const binding = await runs.readRun(db, { runId: source.run.id, scope });
  assertBinding(source, binding);
  const executionAuthority = await require('./missionEnvelopeAuthority').inspect(db, {
    runId: source.run.id, agentId: scope.entityId, scope: { organizationId: scope.organizationId, projectId: scope.projectId } });
  const receipts = [];
  for (const reference of source.receiptRefs) receipts.push(await receipt(db, { reference, source, scope }));
  const artifacts = [];
  for (const reference of source.artifacts) artifacts.push(await require('./gvxManifestArtifacts').resolve(db, { reference, scope }));
  const claims = [];
  for (const claim of source.claims) claims.push(await scientificClaim(db, { claim, scope }));
  const lineage = [];
  for (const ancestor of source.lineage) lineage.push(await parent(db, { ancestor, scope, missionId: source.mission.id }));
  return { status: 'runtime_resolved', binding, receipts, artifacts, claims, lineage, executionAuthority,
    claimsActive: claims.every(claim => claim.status === 'proposed'), postconditions: 'not_evaluated', promotionAllowed: false };
}

function assertBinding(source, binding) {
  if (!binding || binding.mission.id !== source.mission.id
      || binding.mission.contractHash !== source.mission.contractHash || binding.hash !== source.mission.bindingHash) {
    throw error('GVX_MANIFEST_MISSION_BINDING_MISMATCH');
  }
}

async function receipt(db, input) {
  await workers.ensure(db);
  const row = await db.get('SELECT run_id FROM biological_worker_receipts WHERE receipt_id = ?', input.reference.receiptId);
  if (!row) throw error('GVX_MANIFEST_RECEIPT_UNRESOLVED');
  const value = await workers.receipt(db, row.run_id);
  const binding = await workers.binding(db, row.run_id);
  assertReceipt(input, { value, binding });
  if (!runs.sameTenant(await runs.agentScope(db, value.workerId), input.scope)) throw error('GVX_MANIFEST_RECEIPT_SCOPE_MISMATCH');
  const observations = await workers.observations(db, row.run_id);
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id = ?', row.run_id);
  if (!run || run.status !== value.result.status || observations.some(item => !item.applied)
      || values.digest(observations.map(item => item.hash)) !== values.digest(value.evidence.observations)) {
    throw error('GVX_MANIFEST_RECEIPT_OBSERVATIONS_MISMATCH');
  }
  return { receiptId: value.receiptId, sha256: value.payloadHash, runId: value.runId,
    workerId: value.workerId, costs: value.costs, recordedResult: value.result,
    integrity: 'verified', postconditions: 'not_evaluated',
    nativeVerification: await require('./epistemic/nativeOracleInspection').inspect(db, { runId: value.runId, agentId: value.workerId }) };
}

function assertReceipt(input, receipt) {
  const { value, binding } = receipt;
  if (!value || value.receiptId !== input.reference.receiptId || value.payloadHash !== input.reference.sha256
      || value.missionId !== input.source.mission.id || !binding || binding.missionId !== value.missionId
      || values.digest(binding) !== value.bindingHash) throw error('GVX_MANIFEST_RECEIPT_BINDING_MISMATCH');
}

async function scientificClaim(db, input) {
  if (!input.claim.scientificExperimentId) throw error('GVX_MANIFEST_CLAIM_SOURCE_REQUIRED');
  const claim = await db.get(`SELECT c.* FROM scientific_claims c
    JOIN experiments e ON e.id = c.experiment_id JOIN workspaces w ON w.id = e.workspace_id
    WHERE c.claim_id = ? AND c.experiment_id = ? AND e.experiment_type = 'scientific_experiment'
    AND w.organization_id = ? AND w.project_id = ?`, input.claim.id, input.claim.scientificExperimentId,
  input.scope.organizationId, input.scope.projectId);
  if (!claim) throw error('GVX_MANIFEST_CLAIM_SCOPE_MISMATCH');
  if (values.hashBytes(Buffer.from(claim.statement, 'utf8')) !== input.claim.statementHash) throw error('GVX_MANIFEST_CLAIM_CHANGED');
  const lifecycle = await require('./scientificClaimLifecycle').inspect(db, claim);
  return { claimId: claim.claim_id, experimentId: claim.experiment_id,
    declaredStatus: input.claim.status, status: lifecycle.status, headHash: lifecycle.headHash,
    changedSinceAdmission: lifecycle.status !== input.claim.status, integrity: 'verified' };
}

async function parent(db, input) {
  const ledger = require('./gvxDevelopmentLedger');
  const events = await ledger.listAllEvents(db, input.scope);
  const event = events.find(item => item.type === 'experiment_started'
    && item.payload.plan?.experimentalManifest?.hash === input.ancestor.manifestHash);
  const manifest = event?.payload.plan?.experimentalManifest;
  if (!manifest || manifest.payload.provenance.run.id !== input.ancestor.runId
      || manifest.payload.provenance.mission.id !== input.missionId) throw error('GVX_MANIFEST_PARENT_UNRESOLVED');
  require('./gvxExperimentManifest').verify(manifest);
  return { ...input.ancestor, eventId: event.id, integrity: 'verified' };
}

module.exports = { resolve };
