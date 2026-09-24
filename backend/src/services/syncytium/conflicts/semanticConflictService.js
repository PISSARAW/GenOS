'use strict';

const detectors = [
  require('./writeConflictDetector'),
  require('./schemaConflictDetector'),
  require('./dependencyConflictDetector'),
  require('./intentConflictDetector'),
  require('./authorityConflictDetector'),
  require('../variants/code/codeConflictDetector'),
  require('../variants/graph/graphConflictDetector')
];

function detectCandidate(context) {
  return detectors.flatMap((detector) => detector.detect(context));
}

function assertNoBlockingConflicts(context) {
  const conflicts = detectCandidate(context);
  if (conflicts.length) {
    throw Object.assign(new Error('Syncytium operation conflicts with a concurrent operation.'), {
      code: 'SYNCYTIUM_SEMANTIC_CONFLICT', conflicts
    });
  }
  return conflicts;
}

module.exports = { detectCandidate, assertNoBlockingConflicts };
