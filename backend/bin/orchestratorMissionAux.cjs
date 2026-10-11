'use strict';

async function executeMorphology(input) {
  const { morphology, outcome, finalVerdict, orchestratorId, telemetry } = input;
  if (!morphology?.agents?.length) return;
  const morphoRuntime = input.runtime || require('../src/services/morphogenesis/morphogenesisRuntime').getMorphogenesisRuntime();
  const result = await morphoRuntime.executeMorphology(morphology, {
    orchestratorId, mode: 'shadow', evidence: outcome?.evidence,
    reason: `post-mission morphogenesis (verdict=${finalVerdict})`
  });
  if (result?.applied === true || result?.committed === true
    || result?.receipt?.committed === true || result?.transition?.committed === true
    || result?.decision === 'APPLIED') {
    throw new Error('Post-mission morphogenesis cannot commit without a governed production bridge.');
  }
  const diagnostic = { ...result, applied: false, proposed: true,
    productionGate: 'POST_MISSION_COMMIT_UNAVAILABLE',
    authorityPending: 'rust_kernel_governance_and_versioned_transition' };
  const { buildMorphogenesisEvent } = require('../src/services/morphogenesis/morphogenesisTelemetryService');
  const event = buildMorphogenesisEvent(diagnostic, orchestratorId);
  event.payload.productionGate = diagnostic.productionGate;
  event.payload.authorityPending = diagnostic.authorityPending;
  telemetry.emitEvent(event);
  return diagnostic;
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

module.exports = { executeMorphology, checkMinimalShortcut };
