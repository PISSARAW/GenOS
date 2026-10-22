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
  missionBudget: { tokens: 20000, costUsd: 1, latencyMs: 26000 }, requestTimeoutMs: 30000,
  allowedCommands: [], allowFileEdits: false });
assert.equal(localMission.prompt, 'Current agent agent-42');
assert.equal(localMission.identityExperimentArm, 'genos_full');
assert.deepEqual(localMission.requiredPatchPaths, ['index.html']);
assert.deepEqual(localMission.requiredPatchMarkers, { 'index.html': ['<h1>'] });
assert.deepEqual(localMission.requiredPatchMinimumBytes, { 'index.html': 1200 });
assert.equal(localMission.identityExperimentSeed, 42);
assert.equal(localMission.executionBudget.costUsd, 1);
assert.equal(localMission.executionBudget.tokens, 20000);
assert.deepEqual(localMission.allowedEvidenceRefs, ['mission', 'worker_self']);
const sheetMission = buildLocalMission({ id: 'agent-43', enhancedPrompt: 'Mission',
  request: { identityExperimentArm: 'identity_sheet' }, missionBudget: {}, requestTimeoutMs: 30000,
  allowedCommands: [], allowFileEdits: false });
assert.deepEqual(sheetMission.allowedEvidenceRefs, ['mission', 'identity_sheet']);
const llmMission = buildLocalMission({ id: 'agent-44', enhancedPrompt: 'Mission',
  request: { identityExperimentArm: 'llm_only' }, missionBudget: {}, requestTimeoutMs: 30000,
  allowedCommands: [], allowFileEdits: false });
assert.deepEqual(llmMission.allowedEvidenceRefs, ['mission']);
const challengeMission = buildLocalMission({ id: 'agent-45', enhancedPrompt: 'Challenge C',
  request: { identityExperimentArm: 'genos_full', identityExperimentScenario: 'C' }, missionBudget: {},
  requestTimeoutMs: 30000, allowedCommands: [], allowFileEdits: false });
assert.equal(challengeMission.identityExperimentScenario, 'C');
assert.equal(challengeMission.workerKind, 'specialist');
assert.equal(challengeMission.specialtyNiche, 'identity continuity and causal self-model analysis');
const challengeA = require('../../benchmarks/identity-challenge/runtime-llm.cjs').SCENARIOS.A;
assert.match(challengeA, /compare the complete ID character for character/i);
assert.match(challengeA, /If your current canonical ID is not visible, return outcome unresolved/i);
const challengeFormat = require('../src/services/agents/workerArtifactResponseSchema')
  .workerArtifactResponseFormat(challengeMission.workerKind, challengeMission.allowedEvidenceRefs,
    { identityExperimentScenario: challengeMission.identityExperimentScenario, specialtyNiche: challengeMission.specialtyNiche });
assert.ok(challengeFormat.schema.properties.specialtyAssessment);
assert.ok(challengeFormat.schema.required.includes('specialtyAssessment'));
assert.ok(challengeFormat.schema.required.includes('uncertainties'));
assert.equal(challengeFormat.schema.properties.specialtyAssessment.properties.niche.const, challengeMission.specialtyNiche);
assert.ok(!challengeFormat.schema.properties.scopeCompletion);
assert.equal(challengeFormat.schema.allOf, undefined);
const invalidScenario = buildLocalMission({ id: 'agent-46', enhancedPrompt: 'Mission',
  request: { identityExperimentArm: 'genos_full', identityExperimentScenario: 'D' }, missionBudget: {},
  requestTimeoutMs: 30000, allowedCommands: [], allowFileEdits: false });
assert.equal(invalidScenario.workerKind, 'bounded_worker');
assert.equal(invalidScenario.identityExperimentScenario, null);
const llmPrompt = buildAnalysisPrompt({ selfIntro: '', workerSelfBlock: '', conscienceBlock: '',
  workerInstruction: 'Keep the evidence boundary.', evidenceRule: 'Return JSON.', agentName: 'GenOS Worker',
  prompt: 'Mission', identityExperimentArm: 'llm_only' });
assert.match(llmPrompt, /bounded language-model worker/);
assert.doesNotMatch(llmPrompt, /WORKER SELF|IDENTITÉ/);
process.env.GENOS_IDENTITY_EXPERIMENT = prior;
console.log('identity experiment prompt treatments: PASS');
