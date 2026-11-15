'use strict';

function localWorkspaceConfigRule1(context) {
  return context.agentId && context.orchestratorId && context.agentId !== context.orchestratorId;
}

function localWorkspaceConfigRule2(context) {
  return context.process.env.GENOS_WORKSPACE_NAME || context.path.basename(context.workspaceRoot) || 'workspace';
}

function localWorkspaceConfigRule3(context) {
  return {
    workspaceRoot: context.workspaceRoot, name: context.name,
    organizationId: context.String(context.process.env.GENOS_LOCAL_ORGANIZATION_ID || 'org-local').trim(),
    projectId: context.String(context.process.env.GENOS_LOCAL_PROJECT_ID || 'project-local').trim()
  };
}

module.exports = { localWorkspaceConfigRule1, localWorkspaceConfigRule2, localWorkspaceConfigRule3 };
