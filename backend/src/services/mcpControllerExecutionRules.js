'use strict';

function resolveMissionActorAuthorization(context) {
  return context.scope && (context.bound.envelope.scope.organizationId !== context.scope.organizationId
      || context.bound.envelope.scope.projectId !== context.scope.projectId);
}

module.exports = { resolveMissionActorAuthorization };
