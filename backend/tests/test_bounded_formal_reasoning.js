'use strict';

const assert = require('assert');
const router = require('../src/services/philosophyRouter');

const model = {
  worlds: ['w0', 'w1'],
  actualWorld: 'w0',
  accessibility: [['w0', 'w0'], ['w0', 'w1'], ['w1', 'w1']],
  valuation: { w0: { p: true }, w1: { p: false } },
};

async function evaluateConcept(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } },
  });
}

function assertContract(result) {
  assert.strictEqual(result.supported, true);
  assert.strictEqual(result.promotionEligible, false);
  assert.strictEqual(result.result.contractVersion, 'genos.philosophy-analysis/v1');
  assert.ok(Array.isArray(result.evidence));
  assert.ok(result.uncertainty);
  assert.strictEqual(result.provenance.verified, false);
}

async function main() {
  for (const concept of ['logic.modal', 'logic.possible-worlds', 'logic.kripke-frame']) {
    const result = await evaluateConcept(concept, { formula: 'p', model });
    assertContract(result);
  }

  const duty = await evaluateConcept('logic.deontic', {
    action: 'publish', obligations: ['publish'], prohibitions: ['publish'], permissions: [],
  });
  assertContract(duty);
  assert.strictEqual(duty.result.status, 'contradictory');

  const dynamic = await evaluateConcept('logic.dynamic', {
    model, announcement: 'p',
  });
  assertContract(dynamic);
  assert.strictEqual(dynamic.result.status, 'simulated');

  const paraconsistent = await evaluateConcept('logic.paraconsistent', {
    value: 'both', semantics: 'paraconsistent',
  });
  assertContract(paraconsistent);
  assert.strictEqual(paraconsistent.result.value, 'both');

  const paracomplete = await evaluateConcept('logic.paracomplete', { semantics: 'paracomplete' });
  assertContract(paracomplete);
  assert.strictEqual(paracomplete.result.status, 'undetermined');

  for (const concept of ['method.deduction', 'method.induction', 'method.abduction', 'method.bayesianism']) {
    const args = concept === 'method.deduction'
      ? { premises: ['p'], conclusion: 'p' }
      : concept === 'method.induction'
        ? { observations: ['o1'], generalization: 'g' }
        : concept === 'method.abduction'
          ? { observations: ['o'], hypotheses: [{ id: 'h', score: 0.8 }] }
          : { prior: 0.5, likelihood: 0.8, likelihoodNotH: 0.2 };
    assertContract(await evaluateConcept(concept, args));
  }

  await assert.rejects(
    () => evaluateConcept('logic.modal', { formula: 'p', model: { worlds: ['w0'], accessibility: [['w0', 'missing']] } }),
    /Accessibility edges/
  );
  await assert.rejects(
    () => evaluateConcept('logic.paraconsistent', { value: 'true', semantics: 'unsupported' }),
    /Unsupported non-classical semantics/
  );
  console.log('Bounded formal reasoning: contract, validation and non-promotion passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
