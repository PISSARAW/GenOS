'use strict';

const assert = require('node:assert/strict');
const { buildAgentRuntimePrompt } = require('../bin/agent-runtime-prompt.cjs');

const prompt = buildAgentRuntimePrompt({
  selfIntro: 'GenOS orchestrator.',
  mission: { agentId: 'orchestrator', prompt: 'Maintain the target site.' },
  autonomyPlan: { schema: 'genos.autonomous-orchestration/v1alpha1', synthesisOnly: false },
  runtimeAutonomyPlan: { schema: 'genos.autonomous-orchestration/v1alpha1',
    phases: [{ key: 'baseline', requiredTools: ['genos_diagnose', 'genos_snapshot'] }] },
  runtimeContract: {}, strategyContract: {}, isWorker: false, toolLease: ['genos_diagnose', 'genos_snapshot'],
  executionPolicy: {}, allowedCommands: [], capabilities: [], capabilityManifest: null
});
assert.ok(prompt.indexOf('MANDATORY ORCHESTRATOR PROTOCOL') < prompt.indexOf('[ASSIGNED MISSION]'));
assert.match(prompt, /before dispatching any worker or mutating the workspace/);
assert.match(prompt, /before returning a final report/);

const workerPrompt = buildAgentRuntimePrompt({ ...{
  selfIntro: 'GenOS worker.', mission: { agentId: 'worker', prompt: 'Review.' },
  autonomyPlan: { schema: 'genos.autonomous-orchestration/v1alpha1' },
  runtimeAutonomyPlan: { schema: 'genos.autonomous-orchestration/v1alpha1', phases: [] },
  runtimeContract: {}, strategyContract: {}, isWorker: true, toolLease: [], executionPolicy: {},
  allowedCommands: [], capabilities: [], capabilityManifest: null
} });
assert.doesNotMatch(workerPrompt, /MANDATORY ORCHESTRATOR PROTOCOL/);
process.stdout.write('Orchestrator phases precede the mission and remain root-only: PASS\n');
