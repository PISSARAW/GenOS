'use strict';

async function executeMorphology(input) {
  const { morphology, outcome, finalVerdict, orchestratorId, telemetry } = input;
  if (!morphology?.agents?.length) return;
  const morphoRuntime = require('../src/services/morphogenesis/morphogenesisRuntime').getMorphogenesisRuntime();
  const result = await morphoRuntime.executeMorphology(morphology, {
    orchestratorId, evidence: outcome.evidence,
    reason: `post-mission morphogenesis (verdict=${finalVerdict})`
  });
  const { buildMorphogenesisEvent } = require('../src/services/morphogenesis/morphogenesisTelemetryService');
  telemetry.emitEvent(buildMorphogenesisEvent(result, orchestratorId));
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
