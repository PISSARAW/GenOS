'use strict';

function resolveMissionActorAuthorizationValue1(__genosValueScope1) {
  return __genosValueScope1.scope && (__genosValueScope1.bound.envelope.scope.organizationId !== __genosValueScope1.scope.organizationId
      || __genosValueScope1.bound.envelope.scope.projectId !== __genosValueScope1.scope.projectId);
}

module.exports = { resolveMissionActorAuthorizationValue1 };
