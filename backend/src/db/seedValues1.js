'use strict';

function localWorkspaceConfigValue1(__genosValueScope1) {
  return __genosValueScope1.agentId && __genosValueScope1.orchestratorId && __genosValueScope1.agentId !== __genosValueScope1.orchestratorId;
}

function localWorkspaceConfigValue2(__genosValueScope2) {
  return __genosValueScope2.process.env.GENOS_WORKSPACE_NAME || __genosValueScope2.path.basename(__genosValueScope2.workspaceRoot) || 'workspace';
}

function localWorkspaceConfigValue3(__genosValueScope3) {
  return {
    workspaceRoot: __genosValueScope3.workspaceRoot, name: __genosValueScope3.name,
    organizationId: (0, __genosValueScope3.String)(__genosValueScope3.process.env.GENOS_LOCAL_ORGANIZATION_ID || 'org-local').trim(),
    projectId: (0, __genosValueScope3.String)(__genosValueScope3.process.env.GENOS_LOCAL_PROJECT_ID || 'project-local').trim()
  };
}

module.exports = { localWorkspaceConfigValue1, localWorkspaceConfigValue2, localWorkspaceConfigValue3 };
