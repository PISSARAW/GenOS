'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cedar = require('@cedar-policy/cedar-wasm/nodejs');

const policyRoot = path.resolve(__dirname, '../../policies');
const schema = fs.readFileSync(path.join(policyRoot, 'agent-authority.cedarschema'), 'utf8');
const source = fs.readFileSync(path.join(policyRoot, 'agent-authority.cedar'), 'utf8');

function policies(text) {
  return { staticPolicies: text, templates: {}, templateLinks: [] };
}

function validatePolicy(text = source) {
  const result = cedar.validate({ schema, policies: policies(text), validationSettings: { mode: 'strict' } });
  if (result.type !== 'success' || result.validationErrors.length || result.otherWarnings.length) {
    throw Object.assign(new Error('Cedar agent authority policy is invalid.'), { code: 'CEDAR_POLICY_INVALID' });
  }
  return true;
}

validatePolicy();

function entity(agent) {
  return {
    uid: { type: 'GenOS::Agent', id: agent.id },
    attrs: {
      agentId: agent.id,
      workspaceId: agent.workspace_id || '',
      executionMode: agent.execution_mode || '',
      parentId: agent.parent_agent_id || '',
      sealedDispatchParentId: agent.sealedDispatchParentId || '',
      capsuleDispatchParentId: agent.capsuleDispatchParentId || '',
      boundedDelegationChildId: agent.boundedDelegationChildId || ''
    },
    parents: []
  };
}

function authorize(input) {
  const { principal, resource, action, workspaceId } = input;
  if (!principal?.id || !resource?.id) return false;
  const ctxWorkspaceId = workspaceId || '';
  const entities = [entity(principal)];
  if (principal.id !== resource.id) entities.push(entity(resource));
  const result = cedar.isAuthorized({
    principal: entities[0].uid,
    action: { type: 'GenOS::Action', id: action },
    resource: { type: 'GenOS::Agent', id: resource.id },
    context: { workspaceId: ctxWorkspaceId },
    schema,
    policies: policies(source),
    entities
  });
  return result.type === 'success' && result.response.decision === 'allow' &&
    result.response.diagnostics.errors.length === 0;
}

module.exports = { authorize, validatePolicy };
