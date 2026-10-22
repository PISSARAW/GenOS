'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const profiler = require('../src/services/requestProfilerService');
const artifacts = require('../src/services/agents/workerArtifactContract');
const schemas = require('../src/services/agents/workerArtifactResponseSchema');
const localPrompt = require('../src/services/workerEvidenceLocalPrompt');

function profile(text) {
  return profiler.profileRequest({ mission: `${text}\nCréer un snapshot. Écris answer.md.` }).profile;
}

assert.equal(profile('Corriger le défaut de frontière de pagination.').intent, 'implement');
assert.equal(profile('Statuer sur la promotion lorsque la preuve manque.').intent, 'verify');
assert.equal(profile('Rédiger une note technique expliquant snapshot et branche.').intent, 'explain');

const format = schemas.workerArtifactResponseFormat('bounded_worker', ['mission']);
assert.deepEqual(format.schema.properties.claims.items.properties.evidence.items.enum, ['mission']);
assert.equal(format.schema.allOf[0].else.properties.claims.maxItems, 0);

function dossier(evidence, completedRefs = evidence) {
  return JSON.stringify({ outcome: 'success',
    claims: [{ statement: 'Le travail est terminé.', evidence }],
    scopeCompletion: { scopeRef: 'mission', completedRefs } });
}

const provenance = { source: 'test', allowedEvidenceRefs: ['mission'] };
const invented = artifacts.inspectWorkerArtifact('bounded_worker',
  dossier(['preuve-totalement-inventee']), provenance);
assert.equal(invented.artifact, null);
assert(invented.issues.some((issue) => issue.startsWith('evidence.references.unresolved:')));
assert.equal(artifacts.inspectWorkerArtifact('bounded_worker',
  dossier(['mission']), provenance).issues.length, 0);

const previousCodeWorkers = process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS;
delete process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS;
assert.equal(localPrompt.isCodeWorkerMission({ role: 'implementation', localCodeWorker: true }), true);
assert.equal(localPrompt.isCodeWorkerMission({ role: 'implementation', localCodeWorker: false }), false);
assert.equal(localPrompt.isCodeWorkerMission({ role: 'bounded_worker', workerKind: 'bounded_worker', localCodeWorker: true }), true);
assert.equal(localPrompt.isCodeWorkerMission({ role: 'verifier_worker', workerKind: 'verifier_worker', localCodeWorker: true }), false);
assert.equal(localPrompt.isCodeWorkerMission({ role: 'interview_plan_implementation', workerKind: 'specialist', localCodeWorker: true }), false);
const codePrompt = localPrompt.buildAnalysisPrompt({ codeWorker: true, allowedCommands: ['node verify.cjs'],
  prompt: 'Implement sumPrices.', agentName: 'Bounded worker', workspaceContext: 'src/pricing.js' });
assert.match(codePrompt, /exact allowlist: \["node verify\.cjs"\]/);
assert.doesNotMatch(codePrompt, /"tests":\["npm test"\]/);
if (previousCodeWorkers !== undefined) process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS = previousCodeWorkers;

const root = path.resolve(__dirname, '../..');
const runner = fs.readFileSync(path.join(root, 'benchmarks/reflection-comparison/execute.cjs'), 'utf8');
assert.match(runner, /allow_file_edits:\s*true/);
assert.match(runner, /allowed_commands:/);
assert.match(runner, /local_code_worker:/);
assert.match(runner, /requiredEvidence:\s*\['evidence_report'\]/);

console.log('Reflection campaign root-cause guards passed.');
