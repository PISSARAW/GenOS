'use strict';

function versionConflict(body, current) {
  if (body?.expectedVersion === undefined) return null;
  const version = body.expectedVersion;
  if (!Number.isSafeInteger(version) || version < 1) {
    return { error: { code: 'INVALID_EXPECTED_VERSION', message: 'expectedVersion must be a positive integer.' } };
  }
  if (version !== Number(current)) {
    return { error: { code: 'WORKFLOW_VERSION_CONFLICT', message: 'Workflow changed since it was loaded. Reload before saving or running.' } };
  }
  return null;
}

module.exports = { versionConflict };
