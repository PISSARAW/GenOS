'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { hashBytes } = require('../src/services/trinityProvenanceValues');
const evaluation = require('../src/services/workerCodeMissionEvaluation');
const { build } = require('../src/services/workerCodeEvidenceReport');
const { attachWorkerArtifact } = require('../src/services/workerEvidenceLocalArtifact');
const gate = require('../src/services/aTeam/execution/teamEvidenceService');

async function fixture(root) {
  const content = 'module.exports.increment=x=>x+1;';
  await fs.writeFile(path.join(root, 'module.cjs'), content);
  const proposal = { testStatus: 'passed', changedFileHashes: [
    { path: 'module.cjs', hash: hashBytes(Buffer.from(content)) }],
  tests: [{ command: 'npm test', exitCode: 0, stdout: 'passed', signal: null }],
  testExecutionReceipt: { receiptHash: 'b'.repeat(64) } };
  const mission = { agentId: 'code-worker', workerKind: 'bounded_worker', workspaceRoot: root,
    prompt: 'Repair increment and verify. Runtime scaffolding.', missionObjective: 'Repair increment and verify.',
    missionCriteria: ['increment is correct'],
    allowedEvidenceRefs: [] };
  const ctx = { mission, executionRun: { id: 'code-run' }, budget: 12000, result: { inputTokens: 100, outputTokens: 50 },
    generation: { generationContext: { workerModel: 'ollama://test', latencyMs: 10000 } } };
  return { ctx, proposal, report: build({ mission, proposal }) };
}

function reply(report, passed) {
  return { text: JSON.stringify({ acceptanceEvaluations: [{ criterion: 'increment is correct',
    passed, evidenceRefs: report.claims[0].evidence }] }), inputTokens: 80, outputTokens: 30, costUsd: 0 };
}

async function positive(input) {
  let observed;
  const report = await evaluation.complete(input.ctx, { ...input, generate: async context => {
    observed = context; return reply(input.report, true);
  } });
  assert.match(observed.promptText, /x=>x\+1/);
  assert.match(observed.promptText, /passed=null/);
  assert.doesNotMatch(observed.promptText, /Runtime scaffolding/);
  assert.equal(report.artifacts[0].content, 'module.exports.increment=x=>x+1;');
  assert.equal(report.artifacts[0].sourceRef, report.claims[0].evidence[0]);
  assert.match(report.artifacts[0].uri, /code-worker\/code-run\//);
  const handoff = { handoffId: 'handoff-1', digest: 'a'.repeat(64), version: 1,
    producer: { agentId: input.ctx.mission.agentId }, artifactRefs: report.artifacts };
  const witness = require('../src/services/workerCodeHandoffWitness').witnesses;
  const files = input.proposal.changedFileHashes;
  assert.equal(witness({ handoffContext: [handoff] }, files)[0].files[0].sameTestedContent, true);
  const corrupt = structuredClone(handoff); corrupt.artifactRefs[0].content = 'forged';
  assert.throws(() => witness({ handoffContext: [corrupt] }, files),
    { code: 'WORKER_CODE_HANDOFF_SOURCE_INVALID' });
  const foreign = structuredClone(handoff); foreign.producer.agentId = 'foreign-producer';
  assert.throws(() => witness({ handoffContext: [foreign] }, files),
    { code: 'WORKER_CODE_HANDOFF_SOURCE_INVALID' });
  assert.equal(observed.requestTokenBudget, 11850);
  assert.equal(observed.responseFormatOverride.schema.properties.acceptanceEvaluations.items
    .properties.evidenceRefs.items.enum.includes('mission'), false);
  assert.equal(input.ctx.result.inputTokens, 180);
  assert.equal(input.ctx.result.outputTokens, 80);
  attachWorkerArtifact(report, { mission: input.ctx.mission, codeWorker: true, proposal: input.proposal });
  assert.deepEqual(report.acceptanceEvaluations[0].evidenceRefs, input.report.claims[0].evidence);
  assert.equal(gate.missingMissionCriteria(['increment is correct'], new Map([['worker', {
    promoted: true, report, evidenceRefs: report.claims[0].evidence }]])).length, 0);
}

async function negative(input) {
  const report = await evaluation.complete(input.ctx, { ...input,
    generate: async () => reply(input.report, null) });
  attachWorkerArtifact(report, { mission: input.ctx.mission, codeWorker: true, proposal: input.proposal });
  assert.deepEqual(gate.missingMissionCriteria(['increment is correct'], new Map([['worker', {
    promoted: true, report, evidenceRefs: report.claims[0].evidence }]])), ['increment is correct']);
  const forged = structuredClone(report);
  forged.claims[0].evidence.push('genos://code-file/' + 'f'.repeat(64));
  assert.throws(() => attachWorkerArtifact(forged, { mission: input.ctx.mission,
    codeWorker: true, proposal: input.proposal }), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
  const missing = structuredClone(report); delete missing.acceptanceEvaluations;
  assert.throws(() => attachWorkerArtifact(missing, { mission: input.ctx.mission,
    codeWorker: true, proposal: input.proposal }), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
  const bad = reply(input.report, true);
  bad.text = bad.text.replace(input.report.claims[0].evidence[0], 'invented');
  await assert.rejects(evaluation.complete(input.ctx, { ...input,
    generate: async () => bad }), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
}

async function authorityFailures(root) {
  const expired = await fixture(root);
  expired.ctx.mission.executionDeadlineAt = '2000-01-01T00:00:00.000Z';
  await assert.rejects(evaluation.complete(expired.ctx, { ...expired,
    generate: async () => { throw Error('Must not call provider'); } }), { code: 'EXECUTION_AUTHORITY_EXPIRED' });
  const unknown = await fixture(root);
  await assert.rejects(evaluation.complete(unknown.ctx, { ...unknown,
    generate: async () => ({ ...reply(unknown.report, true), outputTokens: null }) }),
  { code: 'WORKER_CODE_EVALUATION_USAGE_UNKNOWN' });
  assert.equal(unknown.ctx.result.inputTokens, 100);
  const changed = await fixture(root);
  await assert.rejects(evaluation.complete(changed.ctx, { ...changed, generate: async () => {
    await fs.writeFile(path.join(root, 'module.cjs'), 'changed after generation');
    return reply(changed.report, true);
  } }), { code: 'WORKER_CODE_EVALUATION_SOURCE_CHANGED' });
}

async function malformedEvaluations(root) {
  for (const text of ['{', 'null', '[]', '{"unexpected":true}']) {
    const input = await fixture(root);
    await assert.rejects(evaluation.complete(input.ctx, { ...input, generate: async () => ({
      text, schemaViolation: text === '{', inputTokens: 10, outputTokens: 1
    }) }), error => error.code === 'WORKER_OUTPUT_SCHEMA_VIOLATION'
      && Boolean(error.workerArtifactDiagnostics.violations.length));
    assert.equal(input.ctx.result.inputTokens, 110);
    assert.equal(input.ctx.result.outputTokens, 51);
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'code-mission-eval-'));
  try {
    await positive(await fixture(root)); await negative(await fixture(root));
    await authorityFailures(root);
    await malformedEvaluations(root);
    const input = await fixture(root);
    await fs.writeFile(path.join(root, 'module.cjs'), 'changed');
    await assert.rejects(evaluation.complete(input.ctx, { ...input,
      generate: async () => { throw Error('Must not call provider'); } }), { code: 'WORKER_CODE_EVALUATION_SOURCE_CHANGED' });
    const timedOut = await fixture(root); timedOut.proposal.tests[0].timedOut = true;
    assert.throws(() => build({ mission: timedOut.ctx.mission, proposal: timedOut.proposal }),
      { code: 'WORKER_CODE_EVIDENCE_INCOMPLETE' });
    console.log('Code mission evaluations: host witnesses, real usage, schema and unresolved criteria gates PASS.');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
