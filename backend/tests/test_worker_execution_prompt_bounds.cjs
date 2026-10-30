'use strict';
const assert = require('node:assert/strict');
const bounds = require('../src/services/workerExecutionPromptBounds');
const { formatWorkerSelfPrompt } = require('../src/services/workerSelfService');
const self = { workerRole: 'bounded_worker', identity: { id: 'worker', name: 'bounded', role: 'bounded_worker', parentRole: 'orchestrator', generation: 0 },
  operational: { confidence: 0.5, tokenBudget: 0, workerLimit: 0, tools: ['stale_admin_tool'], limitations: [] },
  regulatory: { energy: 0.8, stress: 0.1, integrity: 1 }, identityDecision: { mayAct: true } };
const original = JSON.stringify(self);
const mission = { executionBudget: { tokens: 9000 }, workerTokenLimit: 12000,
  workerContract: { resources: { maxTokens: 10000 }, spawnBudget: 0 }, toolLease: ['genos_report_progress'] };
const projected = bounds.project(self, mission);
const prompt = formatWorkerSelfPrompt(projected);
assert.match(prompt, /Budget tokens : 9000/);
assert.match(prompt, /Workers max : 0/);
assert.match(prompt, /Outils : genos_report_progress/);
assert.doesNotMatch(prompt, /illimité|stale_admin_tool/);
assert.equal(JSON.stringify(self), original);
assert.equal(projected.identityDecision, self.identityDecision);
assert.match(formatWorkerSelfPrompt(bounds.project(self, { toolLease: [] })), /Budget tokens : non observé/);
assert.match(formatWorkerSelfPrompt(bounds.project(self, { toolLease: [] })), /Outils : aucun/);
assert.match(formatWorkerSelfPrompt(bounds.project(self, {})), /Outils : non observés/);
assert.match(formatWorkerSelfPrompt(bounds.project(self, { executionBudget: { tokens: 0 } })), /Budget tokens : 0/);
assert.match(formatWorkerSelfPrompt(self), /Workers max : non observé/);
console.log('Worker prompt uses observed execution bounds without inventing unlimited authority: PASS');
