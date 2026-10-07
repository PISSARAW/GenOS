'use strict';

const assert = require('node:assert/strict');
const { createFormalResult } = require('../../src/services/formalResultService');
const subjectStore = require('../../src/services/epistemic/oracleProcedureSubject');
const registry = require('../../src/services/verifierTrustRegistry');
const bridge = require('../../src/services/epistemic/verifierRuntimeBridge');
const adapter = require('../../src/services/epistemic/oracleProcedureAdapter');
const executor = require('../../src/services/epistemic/oracleNativeProcess');

function antigenFor(subject, producer) {
  const formal = createFormalResult({ canonicalStatement: subjectStore.STATEMENT, status: 'tested',
    assumptions: [], validityDomain: subjectStore.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:native-subset-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.content.workerId,
      source: { type: 'node-worker', uri: `genos://runs/${subject.content.runId}`, digest: `sha256:${subject.bindingHash}` },
      inputs: [], transformations: ['sealed-worker-result-to-subset-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer };
}

function verifiers() {
  return ['subset_bitset', 'subset_enumeration'].map(strategy => ({ id: strategy,
    type: 'procedure_semantic', strategy: [strategy], test: { command: 'node -e process.exit(99)' } }));
}

async function positive(db, context) {
  const oldSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'native-oracle-test-only';
  process.env.NODE_OPTIONS = '--require=nonexistent-oracle-inherited-module';
  try {
    const batch = await bridge.executeVerifierWorkers(context.antigen, verifiers(), context.options);
    assert.equal(batch.results.length, 2);
    for (const result of batch.results) {
      assert.equal(result.status, 'verified', JSON.stringify(result));
      assert.equal(result.receipt.independent, true);
      assert.equal(require('../../src/services/epistemicVerifierReceiptService').validateReceipt(result.receipt,
        [registry.ensureVerifier('procedure_semantic').digest]), true);
      assert.notEqual(result.receipt.executionEvidence[0].processId, process.pid);
      assert.equal(result.receipt.executionEvidence[0].subject.runId, context.options.nativeOracleSubject.runId);
    }
    assert.notEqual(batch.results[0].receipt.executionEvidence[0].cwd, batch.results[1].receipt.executionEvidence[0].cwd);
    const assembly = require('../../src/services/epistemic/aeisPromotionBridge').buildAssuranceAssemblyFromHolobionte(
      [context.antigen], [{ immune: { verifierResults: { results: batch.results } } }],
      { trustedVerifierDigests: [registry.ensureVerifier('procedure_semantic').digest] });
    assert.equal(require('../../src/services/epistemicAssuranceService').evaluateEpistemicAssurance(assembly).eligible, true);
    const duplicates = await bridge.executeVerifierWorkers(context.antigen, [
      { ...verifiers()[0], actorId: 'declared-first', model: 'declared-first' },
      { ...verifiers()[0], actorId: 'declared-second', model: 'declared-second' }
    ], context.options);
    assert.equal(duplicates.results[0].receipt.independent, true);
    assert.equal(duplicates.results[1].receipt.independent, false, 'declared metadata cannot turn the same algorithm into an independent strategy');
    assert.equal((await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', context.options.nativeOracleSubject.runId)).status,
      'blocked', 'an oracle receipt alone must not rewrite or promote the historical run');
  } finally {
    if (oldSecret === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
    else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = oldSecret;
    if (oldNodeOptions === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = oldNodeOptions;
  }
}

async function bindingRefusals(context) {
  const verifier = verifiers()[0];
  const wrong = structuredClone(context.antigen);
  wrong.formalResult.evidence.content.result.sum = 11;
  const altered = antigenFor({ ...context.subject, content: wrong.formalResult.evidence.content }, context.antigen.producer);
  await assert.rejects(adapter.runProcedureOracle(altered, verifier, context.options), { code: 'ORACLE_SEMANTIC_SUBJECT_MISMATCH' });
  await assert.rejects(adapter.runProcedureOracle(context.antigen, verifier, {}), { code: 'ORACLE_RUNTIME_SUBJECT_REQUIRED' });
  await assert.rejects(adapter.runProcedureOracle(context.antigen, { ...verifier, strategy: [...verifier.strategy, 'fake-distance'] }, context.options),
    { code: 'ORACLE_STRATEGY_UNAVAILABLE' });
  const foreign = { ...context.options, nativeOracleSubject: { ...context.options.nativeOracleSubject,
    scope: { ...context.options.nativeOracleSubject.scope, projectId: 'foreign-project' } } };
  await assert.rejects(adapter.runProcedureOracle(context.antigen, verifier, foreign), { code: 'ORACLE_RUNTIME_SUBJECT_MISMATCH' });
  const clock = Date.now;
  Date.now = () => clock() + subjectStore.MAX_AGE_MS + 2000;
  try { await assert.rejects(adapter.runProcedureOracle(context.antigen, verifier, context.options), { code: 'ORACLE_SOURCE_STALE' }); }
  finally { Date.now = clock; }
}

async function semanticRefusals() {
  const method = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
  for (const result of [{ found: true, indices: [0, 0], sum: 10, reachableCount: 6 },
    { found: false, indices: null, sum: null, reachableCount: 6 },
    { found: true, indices: [0, 2], sum: 10, reachableCount: 999 }]) {
    for (const strategy of ['subset_bitset', 'subset_enumeration']) {
      assert.equal((await executor.run({ method, result }, { strategy })).result.status, 'refuted');
    }
  }
  const unsupported = { version: 1, methodId: 'subset_sum', parameters: { values: Array(21).fill(1), target: 10 } };
  const refused = await executor.run({ method: unsupported, result: {} }, { strategy: 'subset_enumeration' });
  assert.equal(refused.result.status, 'inconclusive');
  assert.equal(refused.result.reason, 'oracle_enumeration_budget_exceeded');
}

async function qualify(db, input) {
  const scope = await require('../../src/services/gvxMissionProvenance').agentScope(db, input.workerId);
  const request = { runId: input.runId, agentId: input.workerId, scope };
  const subject = await subjectStore.load(db, request);
  const envelope = await require('../../src/services/missionEnvelopeAuthority').read(db, input.runId);
  const producer = { model: 'native-map-subset-solver', version: '1', actorId: input.workerId,
    strategy: 'reachable-map', workspaceId: envelope.envelope.workspaceRoot };
  const context = { subject, antigen: antigenFor(subject, producer), options: { db, nativeOracleSubject: request, timeoutMs: 10000 } };
  await positive(db, context); await bindingRefusals(context); await semanticRefusals();
  console.log('P1 native oracle: real sealed run, two distinct algorithms and processes, AEIS signed evidence, scope/content/freshness refusals and explicit domain limits passed.');
}

module.exports = { qualify };
