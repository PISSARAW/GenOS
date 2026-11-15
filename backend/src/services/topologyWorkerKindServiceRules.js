'use strict';

function applyTopologyWorkerKinds(context) {
  return context.member.role === 'environment_mapper'
      && (context.mode === 'biome' || context.requested?.topology === 'biome' || context.member.workerAssignment?.topology === 'biome');
}

module.exports = { applyTopologyWorkerKinds };
