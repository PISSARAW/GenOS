'use strict';

function applyTopologyWorkerKindsValue1(__genosValueScope1) {
  return __genosValueScope1.member.role === 'environment_mapper'
      && (__genosValueScope1.mode === 'biome' || __genosValueScope1.requested?.topology === 'biome' || __genosValueScope1.member.workerAssignment?.topology === 'biome');
}

module.exports = { applyTopologyWorkerKindsValue1 };
