'use strict';
const { record, string, enumValue } = require('./contractHelpers');
const HEALTHS = ['HEALTHY', 'STRESSED', 'DEGRADED', 'UNKNOWN'];
function validateDemeHeartbeat(input) {
  const heartbeat = record(input, 'METAPOPULATION_HEARTBEAT_INVALID');
  const code = 'METAPOPULATION_HEARTBEAT_INVALID';
  string(heartbeat.demeId, 'demeId', code);
  string(heartbeat.localStateVersion, 'localStateVersion', code);
  enumValue(heartbeat.health, 'health', { allowed: HEALTHS, code });
  if (heartbeat.lastEvidenceAt !== null && heartbeat.lastEvidenceAt !== undefined) string(heartbeat.lastEvidenceAt, 'lastEvidenceAt', code);
  if (typeof heartbeat.migrationReady !== 'boolean' || typeof heartbeat.recoveryReady !== 'boolean') {
    throw Object.assign(new Error('Heartbeat readiness flags must be boolean.'), { code });
  }
  return heartbeat;
}
module.exports = { validateDemeHeartbeat, HEALTHS };
