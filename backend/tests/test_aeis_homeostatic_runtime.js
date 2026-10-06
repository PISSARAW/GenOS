'use strict';

const assert = require('node:assert/strict');
const rearbitration = require('../src/services/epistemic/epistemicHomeostaticRearbitration');
const { executeVerifierWorkers } = require('../src/services/epistemic/verifierRuntimeBridge');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'test-secret-aeis-homeostatic';

async function main() {
  const antigen = { id: 'antigen-homeostatic', claim: 'echo ok outputs "ok"',
    risk: { score: 0.9 }, epitopes: { evidence: { kind: 'reproducible_artifact', digest: 'sha256:homeostatic' } },
    verificationContract: { test: { command: 'echo ok', expectOutput: 'ok' } } };
  const immune = { pipeline: { decision: { assignedVerifiers: [{ verifier: 'proof', strategy: [] }] } },
    verifierResults: await executeVerifierWorkers(antigen, [{ type: 'proof' }]) };
  assert.equal(rearbitration.verificationRate([{ status: 'verified' }]), 0, 'a declared status is not evidence');
  const forged = structuredClone(immune.verifierResults.results[0]);
  forged.receipt.signature = 'forged';
  assert.equal(rearbitration.verificationRate([forged]), 0);
  const feedback = await rearbitration.applyHomeostaticFeedback(antigen, immune,
    { previousVerificationRate: 0, verifierBudget: { remaining: 0 } });
  assert.equal(feedback.feedback.evidenceDelta, 1);
  assert.ok(feedback.feedback.adjustedPressure < feedback.feedback.pressure);
  assert.equal(feedback.feedback.rearbitration, null);

  const empty = { pipeline: { decision: { assignedVerifiers: [] } },
    verifierResults: { status: 'inconclusive', results: [] } };
  const exhausted = await rearbitration.recruitNicheVerifier(antigen, empty, { verifierBudget: { remaining: 0 } });
  assert.equal(exhausted.recruited, null);
  const budget = { remaining: 1 };
  const recruited = await rearbitration.recruitNicheVerifier(antigen, empty, {
    verifierBudget: budget, preferredVerifierType: 'source',
  });
  assert.equal(recruited.recruited, 'source');
  assert.equal(budget.remaining, 0);
  assert.equal(recruited.immune.verifierResults.results[0].verifierType, 'source');

  const limited = await executeVerifierWorkers(antigen, [{ type: 'proof' }, { type: 'source' }],
    { verifierBudget: { remaining: 1 } });
  assert.equal(limited.results.length, 2);
  assert.equal(limited.results[1].reason, 'verifier_budget_exhausted');
  console.log('AEIS homeostatic feedback, niche selection and verifier budget are active.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
