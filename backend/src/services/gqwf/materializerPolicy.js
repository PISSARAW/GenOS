'use strict';

const MATERIALIZERS = new Set([
  'portable-copy-v1',
  'native-reflink-v1',
  'linux-overlayfs-v1',
  'auto'
]);

function failure(message, code) {
  return Object.assign(new Error(message), { code });
}

function requestedMaterializer(mission) {
  return mission?.executionPolicy?.gqwfMaterializer;
}

function gqwfPolicyActive(mission) {
  return mission?.executionPolicy?.gqwfV2 === true || Boolean(mission?.gqwfRollout);
}

function validateMission(mission) {
  const requested = requestedMaterializer(mission);
  if (requested === undefined) return null;
  if (typeof requested !== 'string' || !MATERIALIZERS.has(requested)) {
    throw failure(`Unknown GQWF mission materializer '${String(requested)}'.`,
      'GQWF_MATERIALIZER_POLICY_INVALID');
  }
  if (!gqwfPolicyActive(mission)) {
    throw failure('A GQWF mission materializer requires GQWF v2 or a canary assignment.',
      'GQWF_MATERIALIZER_POLICY_INACTIVE');
  }
  return requested;
}

function fabricOptions(mission) {
  const materializerId = validateMission(mission);
  return materializerId ? { materializerId } : {};
}

module.exports = {
  fabricOptions,
  requestedMaterializer,
  validateMission
};
