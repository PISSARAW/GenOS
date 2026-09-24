'use strict';

function normalizeErrorOrigin(input = {}) {
  if (!input.errorId || !input.originNodeId) throw new Error('error and origin identifiers are required');
  return { errorId: input.errorId, originNodeId: input.originNodeId, kind: input.kind || 'unknown', artifactIds: input.artifactIds || [], detectedAt: input.detectedAt || Date.now() };
}

module.exports = { normalizeErrorOrigin };
