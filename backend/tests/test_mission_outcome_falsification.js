'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-outcome-falsification-test-only';
const { createFormalResult } = require('../src/services/formalResultService');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const outcome = require('../src/services/missionOutcomeContract');
const { checkSubset } = require('../src/services/epistemic/oracleSubsetChecks');

const verifierDigest = `sha256:${'b'.repeat(64)}`;
const startedAt = process.hrtime.bigint();
const domain = { statement: 'Subset sum natif borné', constraints: ['Indices distincts', 'Somme exacte'] };
const obligation = { id: 'sum', statement: 'La somme déclarée est exacte.',
  oracle: { domain: 'subset_sum', verifierDigest, validityDomain: domain } };
const contract = outcome.build({ goal: 'Vérifier la somme', obligations: [obligation] });
const event = { runId: 'run-a', payload: { missionOutcome: { status: 'verified' } } };

function formalResult() {
  return createFormalResult({ canonicalStatement: obligation.statement, status: 'tested',
    assumptions: [], validityDomain: domain, dependencies: [],
    evidence: { kind: 'reproducible_artifact', content: { runId: 'run-a', sum: 42 },
      reproduction: { command: 'native-subset-sum', environment: 'test' } },
    provenance: { createdAt: '2026-10-12T00:00:00.000Z', actor: 'worker-a',
      source: { type: 'test', uri: 'genos://runs/run-a', digest: `sha256:${'a'.repeat(64)}` },
      inputs: [], transformations: [] }, producer: { model: 'fixture', version: '1' } });
}

function receipt(result, strategy) {
  return issueReceipt({ resultId: result.resultId, evidenceDigest: result.evidence.digest,
    verifierDigest, status: 'verified', independent: true, nonce: `nonce-${strategy}`,
    coveredObligations: [result.resultId],
    executionEvidence: [{ subject: { runId: 'run-a' }, postconditions: { strategy } }] });
}

function fixture() {
  const result = formalResult();
  return { proof: { attestation: { value: { schema: 'genos.native-oracle-attestation/v1',
    accepted: true, domain: 'subset_sum', runId: 'run-a', validUntil: '2099-01-01T00:00:00.000Z' } },
    saved: { manifest: { trustedDigests: [verifierDigest] }, evaluation: { allAccepted: true,
      assembly: { results: [result], verifications: [receipt(result, 'first'), receipt(result, 'second')] } } } } };
}

const cases = [
  { id: 'accepted', valid: true, mutate: () => {} },
  { id: 'constraint-order', valid: true, mutate: (input) => {
    input.contract.obligations[0].oracle.validityDomain.constraints.reverse();
  } },
  { id: 'forged-payload', valid: false, mutate: (input) => { input.verification = null; } },
  { id: 'changed-statement', valid: false, mutate: (input) => {
    input.verification.proof.saved.evaluation.assembly.results[0].canonicalStatement = 'Autre résultat';
  } },
  { id: 'changed-domain', valid: false, mutate: (input) => {
    input.verification.proof.saved.evaluation.assembly.results[0].validityDomain.statement = 'Autre domaine';
  } },
  { id: 'changed-artifact', valid: false, mutate: (input) => {
    input.verification.proof.saved.evaluation.assembly.results[0].evidence.content.sum = 41;
  } },
  { id: 'other-run-attestation', valid: false, mutate: (input) => {
    input.verification.proof.attestation.value.runId = 'run-b';
  } },
  { id: 'other-run-receipt', valid: false, mutate: (input) => {
    const assembly = input.verification.proof.saved.evaluation.assembly;
    assembly.verifications[0] = issueReceipt({ ...assembly.verifications[0],
      executionEvidence: [{ subject: { runId: 'run-b' }, postconditions: { strategy: 'first' } }] });
  } },
  { id: 'wrong-oracle-domain', valid: false, mutate: (input) => {
    input.verification.proof.attestation.value.domain = 'other';
  } },
  { id: 'wrong-verifier', valid: false, mutate: (input) => {
    input.contract.obligations[0].oracle.verifierDigest = `sha256:${'c'.repeat(64)}`;
  } },
  { id: 'expired-attestation', valid: false, mutate: (input) => {
    input.verification.proof.attestation.value.validUntil = '2000-01-01T00:00:00.000Z';
  } },
  { id: 'missing-receipt', valid: false, mutate: (input) => {
    input.verification.proof.saved.evaluation.assembly.verifications.pop();
  } },
  { id: 'tampered-signature', valid: false, mutate: (input) => {
    input.verification.proof.saved.evaluation.assembly.verifications[0].signature = '0'.repeat(64);
  } },
  { id: 'same-strategy', valid: false, mutate: (input) => {
    const assembly = input.verification.proof.saved.evaluation.assembly;
    assembly.verifications[1] = issueReceipt({ ...assembly.verifications[1],
      executionEvidence: [{ subject: { runId: 'run-a' }, postconditions: { strategy: 'first' } }] });
  } },
];

const results = cases.map((entry) => {
  const input = { contract: structuredClone(contract), verification: fixture(), event: structuredClone(event) };
  entry.mutate(input);
  const verdict = outcome.evaluate(input.contract, input.verification, input.event).status;
  return { id: entry.id, valid: entry.valid, verdict };
});
const validCases = results.filter((entry) => entry.valid);
const invalidCases = results.filter((entry) => !entry.valid);
const falseAccepts = invalidCases.filter((entry) => entry.verdict === 'verified');
const falseRejects = validCases.filter((entry) => entry.verdict !== 'verified');
assert.deepEqual(falseAccepts, []);
assert.deepEqual(falseRejects, []);
const twoObligations = outcome.build({ goal: 'Vérifier deux propriétés', obligations: [obligation,
  { id: 'count', statement: 'Le nombre déclaré est exact.', oracle: obligation.oracle }] });
const partial = outcome.evaluate(twoObligations, fixture(), event);
assert.equal(partial.status, 'inconclusive');
assert.deepEqual(partial.verifiedObligations, ['sum']);
assert.deepEqual(partial.missingObligations, ['count']);

const semanticCases = [
  { id: 'witness', valid: true, values: [2, 3], target: 5,
    result: { found: true, indices: [0, 1], sum: 5, reachableCount: 4 } },
  { id: 'no-solution', valid: true, values: [2, 3], target: 4,
    result: { found: false, indices: null, sum: null, reachableCount: 3 } },
  { id: 'duplicate-index', valid: false, values: [2, 3], target: 5,
    result: { found: true, indices: [0, 0], sum: 5, reachableCount: 4 } },
  { id: 'wrong-count', valid: false, values: [2, 3], target: 5,
    result: { found: true, indices: [0, 1], sum: 5, reachableCount: 3 } },
  { id: 'false-no-solution', valid: false, values: [2, 3], target: 5,
    result: { found: false, indices: null, sum: null, reachableCount: 4 } },
  { id: 'false-success', valid: false, values: [2, 3], target: 4,
    result: { found: true, indices: [0, 1], sum: 4, reachableCount: 3 } }
];
const oracleResults = semanticCases.flatMap((entry) => ['subset_bitset', 'subset_enumeration']
  .map((strategy) => ({ id: `${entry.id}:${strategy}`, valid: entry.valid,
    verdict: checkSubset({ method: { version: 1, methodId: 'subset_sum',
      parameters: { values: entry.values, target: entry.target } }, result: entry.result }, strategy).status })));
const oracleFalseAccepts = oracleResults.filter((entry) => !entry.valid && entry.verdict === 'verified');
const oracleFalseRejects = oracleResults.filter((entry) => entry.valid && entry.verdict !== 'verified');
assert.deepEqual(oracleFalseAccepts, []);
assert.deepEqual(oracleFalseRejects, []);
console.log(JSON.stringify({ scope: 'v2 structural fixtures and in-process bounded subset oracle',
  wallTimeMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
  costScope: { modelCalls: 0, nativeProcesses: 0 },
  structural: { validCases: validCases.length, invalidCases: invalidCases.length,
    falseAccepts: falseAccepts.length, falseRejects: falseRejects.length },
  semantic: { validCases: oracleResults.filter((entry) => entry.valid).length,
    invalidCases: oracleResults.filter((entry) => !entry.valid).length,
    falseAccepts: oracleFalseAccepts.length, falseRejects: oracleFalseRejects.length },
  results, oracleResults }));
