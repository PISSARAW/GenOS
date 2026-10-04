'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const compiler = require('../src/services/cognitiveResidualCompiler');
const generation = require('../src/services/trinityHypothesisGenerationService');
const modelRouter = require('../src/services/modelRouter');

function input(db, mission = 'Test the cache invalidation fix.') {
  return {
    db, agentId: 'trinity-worker', normalizedMission: {
      prompt: mission, executionBudget: { costUsd: 1 },
      trinityHypothesisDesign: { generateHypotheses: true, assumptions: ['cache may be stale'] }
    }
  };
}

function modelAnswer() {
  return JSON.stringify({ candidateHypotheses: ['direct', 'structured', 'falsification'].map((chamber, index) => ({
    id: `candidate_${index}`, chamber,
    hypothesis: `The cache behavior changes under condition ${index + 1}.`,
    predictions: [`Observation ${index + 1}`], falsificationCriteria: ['No difference observed'],
    experiment: { protocol: 'Run the same cache replay against all three variants.',
      expectedOutcome: `Outcome ${index + 1}` }
  })) });
}

function testProjection() {
  const supplied = { generateHypotheses: true, candidateHypotheses: [{ hypothesis: 'A caller proposal' }],
    sourceEvidence: ['private-evidence'] };
  const result = compiler.compileHypotheses({ agentId: 'worker', mission: 'Check caching', supplied, budget: 0.1 });
  assert.equal(result.status, 'ready');
  assert.equal(result.contract.operation, 'INFER');
  assert.deepEqual(result.obligations.runnable, ['propose_hypotheses']);
  assert.deepEqual(result.obligations.waiting, ['verify_hypotheses']);
  assert.equal(result.contract.obligationDigest, result.obligations.digest);
  assert.deepEqual(result.contract.output, ['candidateHypotheses']);
  assert.match(result.prompt, /callerCandidates:/);
  assert.doesNotMatch(result.prompt, /private-evidence/);
  assert.ok(result.omissions.some((item) => item.field === 'supplied.sourceEvidence'));
  assert.match(result.visibility.promptDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(compiler.compileHypotheses({ agentId: 'worker', mission: 'Check caching',
    supplied: { generateHypotheses: false } }).status, 'blocked');
  assert.equal(compiler.compileHypotheses({ agentId: 'worker', mission: 'x'.repeat(20_000), supplied, budget: 0.1 })
    .reason, 'projection_too_large');
  assert.equal(compiler.compileHypotheses({ agentId: 'worker', mission: 'Check caching',
    supplied: { generateHypotheses: true, candidateHypotheses: 'wrong' }, budget: 0.1 })
    .reason, 'candidate_hypotheses_invalid');
  assert.equal(compiler.compileHypotheses({ agentId: 'worker', mission: 'Check caching', supplied })
    .reason, 'generation_budget_required');
}

async function testGenerationReceipt() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const original = modelRouter.generate;
  let calls = 0;
  modelRouter.generate = async (request) => {
    calls += 1;
    assert.match(request.prompt, /mission: "Test the cache invalidation fix\."/);
    return { text: modelAnswer(), model: 'stub-model', provider: 'stub-provider' };
  };
  try {
    const first = await generation.design(input(db));
    assert.equal(first.selectionMethod, 'supplied_candidates_v1');
    assert.equal(first.hypothesisGeneration.status, 'generated');
    assert.equal(first.hypothesisGeneration.verification, 'unverified');
    assert.equal(first.hypothesisGeneration.candidateCount, 3);
    assert.ok(first.selectedTriplet.every((item) => item.origin === 'model_generated'));
    const again = await generation.design(input(db));
    assert.equal(again.hypothesisGeneration.reused, true);
    assert.equal(calls, 1);
    const budgetChanged = input(db);
    budgetChanged.normalizedMission.trinityHypothesisGenerationBudgetUsd = 0.2;
    const changed = await generation.design(budgetChanged);
    assert.equal(changed.hypothesisGeneration.status, 'unavailable');
    assert.match(changed.hypothesisGeneration.reason, /obligation audit mismatch/);
    assert.equal(calls, 1);
    const receipt = await db.get('SELECT status, prompt_bytes, audit_blob FROM cognitive_inference_receipts');
    assert.equal(receipt.status, 'completed');
    assert.match(receipt.prompt_bytes.toString('utf8'), /callerCandidates/);
    assert.ok(receipt.audit_blob.length > 0);
    await db.run("UPDATE cognitive_inference_receipts SET prompt_bytes = x'00'");
    const tampered = await generation.design(input(db));
    assert.equal(tampered.hypothesisGeneration.status, 'unavailable');
    assert.match(tampered.hypothesisGeneration.reason, /prompt digest mismatch/);
    assert.equal(calls, 1);
  } finally { modelRouter.generate = original; await db.close(); }
}

async function testFailClosed() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const original = modelRouter.generate;
  let calls = 0;
  modelRouter.generate = async () => { calls += 1; return { text: 'not JSON' }; };
  try {
    const fallback = await generation.design(input(db, 'Another cache mission'));
    assert.equal(fallback.selectionMethod, 'fixed_v1');
    assert.equal(fallback.hypothesisGeneration.status, 'unavailable');
    assert.equal((await db.get('SELECT status FROM cognitive_inference_receipts')).status, 'failed');
    const repeated = await generation.design(input(db, 'Another cache mission'));
    assert.equal(repeated.hypothesisGeneration.reason, 'receipt_failed');
    assert.equal(calls, 1);
    const oversized = await generation.design(input(db, 'x'.repeat(20_000)));
    assert.equal(oversized.hypothesisGeneration.status, 'blocked');
    assert.equal(oversized.hypothesisGeneration.reason, 'projection_too_large');
    assert.equal(calls, 1);
  } finally { modelRouter.generate = original; await db.close(); }
}

async function main() {
  testProjection();
  await testGenerationReceipt();
  await testFailClosed();
  console.log('G-CIR Trinity hypothesis generation checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
