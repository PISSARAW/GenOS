'use strict';

const daemonStigmergy = require('../../daemon/daemonStigmergyService');
const rhizome = require('../../rhizomeCoordinationService');

const TRAIL_KINDS = Object.freeze({
  TEST_INSTABILITY: 'ROUTE_FAILURE',
  CONTRACT_DRIFT: 'SECURITY_RISK',
  PERFORMANCE_REGRESSION: 'HIGH_LATENCY',
  HIGH_RISK: 'SECURITY_RISK',
  DEAD_END: 'DEAD_END',
  VERIFIED_OK: 'VERIFIED_RESULT'
});

function toRhizomeTrail(marker) {
  const signal = daemonStigmergy.buildBridgeSignal(marker);
  if (!signal) throw Object.assign(new Error('Invalid daemon stigmergy marker.'), { code: 'RHIZOME_DAEMON_MARKER_INVALID' });
  return {
    marker: `${signal.locus}:${marker.kind}`,
    options: {
      kind: TRAIL_KINDS[marker.kind],
      amount: Math.abs(signal.intensity),
      isRepellent: signal.isRepellent,
      source: `daemon:${marker.territoryId}`,
      evidenceRefs: marker.evidenceId ? [marker.evidenceId] : [],
      scope: ['mission', 'workspace', 'persistent'].includes(marker.scope) ? marker.scope : 'workspace'
    }
  };
}

async function record(input) {
  const mapped = toRhizomeTrail(input.marker);
  const daemonResult = await daemonStigmergy.depositMarker(input.db, input.marker);
  if (!daemonResult.deposited) return { recorded: false, reason: 'DAEMON_STORE_REJECTED' };
  const trail = await rhizome.depositTrail(input.sessionId, mapped.marker, {
    ...mapped.options,
    identityContext: input.trust?.identityContext,
    trustedIdentityDigests: input.trust?.trustedIdentityDigests,
    db: input.db
  });
  return { recorded: true, daemon: daemonResult, trail };
}

module.exports = { toRhizomeTrail, record };
