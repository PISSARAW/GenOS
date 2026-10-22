'use strict';
const assert = require('assert');
const { applyIdentityExperimentTreatment, promptSha256 } = require('../src/services/identityExperimentPromptTreatment');
const { buildLocalMission } = require('../bin/orchestratorWindowsLocalExecution.cjs');
const { buildAnalysisPrompt } = require('../src/services/workerEvidenceLocalPrompt');
const base = { selfIntro: 'identity intro', conscienceBlock: 'conscience', workerSelfBlock: 'worker self\n- Confiance calibrée : 64%', agentId: 'agent-1', agentName: 'Ada', role: 'worker' };
const prior = process.env.GENOS_IDENTITY_EXPERIMENT;
process.env.GENOS_IDENTITY_EXPERIMENT = '1';
const full = applyIdentityExperimentTreatment({ ...base, arm: 'genos_full' });
const masked = applyIdentityExperimentTreatment({ ...base, arm: 'self_model_masked' });
const llm = applyIdentityExperimentTreatment({ ...base, arm: 'llm_only' });
const sheet = applyIdentityExperimentTreatment({ ...base, arm: 'identity_sheet' });
assert.match(full.workerSelfBlock, /worker self/);
assert.equal(full.audit.selfModelFacts.calibratedConfidencePercent, 64);
assert.equal(masked.workerSelfBlock, '');
assert.equal(masked.selfIntro, full.selfIntro);
assert.equal(llm.selfIntro, '');
assert.equal(llm.conscienceBlock, '');
assert.match(sheet.workerSelfBlock, /Canonical agent ID: agent-1/);
assert.doesNotMatch(sheet.workerSelfBlock, /worker self/);
assert.equal(new Set([full, masked, llm, sheet].map((x) => x.audit.arm)).size, 4);
assert.equal(promptSha256('prompt').length, 64);
const localMission = buildLocalMission({ id: 'agent-42', enhancedPrompt: 'Current agent {{AGENT_ID}}',
  request: { identityExperimentArm: 'genos_full', identityExperimentSeed: 42, localModel: 'ollama://qwen2.5:14b',
    requiredPatchPaths: ['index.html'], requiredPatchMarkers: { 'index.html': ['<h1>'] },
    requiredPatchMinimumBytes: { 'index.html': 1200 } },
  missionBudget: {}, requestTimeoutMs: 30000, allowedCommands: [], allowFileEdits: false });
assert.equal(localMission.prompt, 'Current agent agent-42');
assert.equal(localMission.identityExperimentArm, 'genos_full');
assert.deepEqual(localMission.requiredPatchPaths, ['index.html']);
assert.deepEqual(localMission.requiredPatchMarkers, { 'index.html': ['<h1>'] });
assert.deepEqual(localMission.requiredPatchMinimumBytes, { 'index.html': 1200 });
assert.equal(localMission.identityExperimentSeed, 42);
const llmPrompt = buildAnalysisPrompt({ selfIntro: '', workerSelfBlock: '', conscienceBlock: '',
  workerInstruction: 'Keep the evidence boundary.', evidenceRule: 'Return JSON.', agentName: 'GenOS Worker',
  prompt: 'Mission', identityExperimentArm: 'llm_only' });
assert.match(llmPrompt, /bounded language-model worker/);
assert.doesNotMatch(llmPrompt, /WORKER SELF|IDENTITÉ/);
process.env.GENOS_IDENTITY_EXPERIMENT = prior;
console.log('identity experiment prompt treatments: PASS');
