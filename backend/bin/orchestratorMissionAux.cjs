'use strict';

async function executeMorphology(input) {
  const { morphology, outcome, finalVerdict, orchestratorId, telemetry } = input;
  if (!morphology?.agents?.length) return;
  const morphoRuntime = input.runtime || require('../src/services/morphogenesis/morphogenesisRuntime').getMorphogenesisRuntime();
  const result = await morphoRuntime.executeMorphology(morphology, {
    orchestratorId, mode: 'shadow', evidence: outcome?.evidence,
    reason: `post-mission morphogenesis (verdict=${finalVerdict})`
  });
  assertNoCommit(result);
  const adjudicate = input.adjudicate || require('../src/services/morphogenesis/runtime/morphogenesisPersistedReadOnlyService').adjudicatePersistedOutcome;
  const kernelReadOnly = await adjudicate({ db: input.db, morphology,
    missionId: input.missionId || orchestratorId, snapshotRef: input.snapshotRef, outcome });
  const diagnostic = { ...result, applied: false, proposed: true,
    kernelReadOnly,
    productionGate: 'POST_MISSION_COMMIT_UNAVAILABLE',
    authorityPending: 'rust_kernel_governance_and_versioned_transition' };
  const { buildMorphogenesisEvent } = require('../src/services/morphogenesis/morphogenesisTelemetryService');
  const event = buildMorphogenesisEvent(diagnostic, orchestratorId);
  event.payload.productionGate = diagnostic.productionGate;
  event.payload.authorityPending = diagnostic.authorityPending;
  event.payload.kernelDecision = kernelReadOnly.decision;
  event.payload.kernelAvailable = kernelReadOnly.available;
  event.payload.kernelReason = kernelReadOnly.reason || null;
  event.payload.proposalRecordId = kernelReadOnly.proposalRecordId || null;
  event.payload.kernelReceiptId = kernelReadOnly.receiptId || null;
  telemetry.emitEvent(event);
  return diagnostic;
}

function assertNoCommit(result) {
  if (result?.applied === true || result?.committed === true
    || result?.receipt?.committed === true || result?.transition?.committed === true
    || result?.decision === 'APPLIED') {
    throw new Error('Post-mission morphogenesis cannot commit without a governed production bridge.');
  }
}

async function persistMorphologySnapshot(input) {
  try {
    return await require('../src/services/morphogenesis/runtime/morphogenesisPersistedReadOnlyService')
      .persistPreparedMorphology(input);
  } catch (error) {
    input.telemetry.emitEvent({ eventType: 'MORPHOLOGY_SNAPSHOT_FAILED', agentId: input.agentId,
      action: 'SNAPSHOT_PREPARED_MORPHOLOGY', detail: error.message, severity: 'warning' });
    return null;
  }
}

async function checkMinimalShortcut(input) {
  const { db, action, requestMemory, request, task, telemetry, id } = input;
  if (action !== 'orchestrate') return false;
  const minimal = await requestMemory.maybeHandleMinimal(db, request, task);
  if (minimal?.minted) {
    telemetry.emitEvent({ eventType: 'REQUEST_ROUTED', agentId: id, action: minimal.route.mode,
      detail: minimal.route.reason, payload: { requestClass: minimal.minted.profile.request_class }, severity: 'info' });
  }
  if (!minimal.handled) return false;
  process.stdout.write(JSON.stringify(minimal.payload));
  return true;
}

module.exports = { executeMorphology, checkMinimalShortcut, persistMorphologySnapshot };
