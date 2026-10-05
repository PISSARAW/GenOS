'use strict';

const assert = require('assert');
const { requestFor } = require('../src/services/ontogenesis/runtimeHarness');
const { buildMissionMorphogenesisInput } = require('../src/services/agentRuntimeAdapter/missionMorphogenesis');

const developmentalContext = {
  shev: { available: true, pendingInitiatives: 2 },
  gvx: { available: true, eventCount: 4 },
  failClosed: false
};
const mission = {
  capabilities: ['analyze'], morphology: {}, concepts: {}, developmentalContext,
  plan: { domains: ['epistemology'], capabilityRequirements: ['analyze'], budgets: { tokens: 10 },
    strategy: { id: 'minimal_patch' } }
};
const request = requestFor({ id: 'run-1', project: { id: 'project-1', objective: 'Observer' },
  task: { id: 'task-1', title: 'observer', acceptance_json: '[]' },
  selection: { topology: 'trinity', variant: 'default', workerRoles: [] }, worktree: 'D:\\DynamicDuo',
  budgets: { seconds: 10, tokens: 1, usd: 1 }, config: {}, mission });
assert.match(request.mission, /"pendingInitiatives":2/);
assert.strictEqual(request.developmentalContext, developmentalContext);
assert.match(request.mission, /minimal_patch/);
const morphogenesis = buildMissionMorphogenesisInput({ db: {}, agentId: 'agent-1',
  normalizedMission: { prompt: 'Observer', missionCapabilityPlan: mission.plan, developmentalContext,
    strategyConcept: { id: 'minimal_patch' } },
  autonomyPlan: { profile: {}, organization: null, tokenPolicy: { total: 10 }, dispatchWorkers: [], trinity: { activated: true } },
  contractRecord: null });
assert.deepStrictEqual(morphogenesis.problemProfile.developmentalContext, developmentalContext);
assert.deepStrictEqual(morphogenesis.problemProfile.strategyConcept, { id: 'minimal_patch' });
console.log('ontogenesis developmental runtime checks passed.');
