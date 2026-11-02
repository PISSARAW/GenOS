'use strict';

const { fail } = require('./qualityContract');

function assertSupportedQualityRequest(action, request) {
  if (!request.qualityElevation) return;
  if (['orchestrate', 'dispatch_worker', 'dispatch_team'].includes(action)) return;
  throw fail('GQEL_FINAL_INTEGRATION_REQUIRED', 'This direct topology action has no global final-artifact integration stage. Use native orchestrate or explicit per-worker quality contracts.');
}

function assertTeamFinalStage(run) {
  if (run.qualityElevation && run.execution?.organizationPolicy?.variant === 'multiteam') {
    throw fail('GQEL_FINAL_INTEGRATION_REQUIRED', 'Multiteam quality requires a supported final integration stage; child-team successes do not qualify the collective artifact.');
  }
}

module.exports = { assertSupportedQualityRequest, assertTeamFinalStage };
