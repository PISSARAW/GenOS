'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { executeVerifierWorkers } = require('../src/services/epistemic/verifierRuntimeBridge');
const { reArbitrateFromHomeostasis } = require('../src/services/epistemic/epistemicHomeostaticArbitration');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'aeis-lineage-regression';

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aeis-lineage-'));
  try {
    const antigen = { id: 'lineage', claim: 'echo ok outputs "ok"', risk: { score: 1 },
      novelty: 1, contradictions: [{ weight: 1 }], budgetRemaining: 0,
      epitopes: { evidence: { digest: 'sha256:lineage', kind: 'reproducible_artifact' },
        validityDomain: { coverage: 0, constraints: 10 } },
      verificationContract: { test: { command: 'echo ok', cwd: root, expectOutput: 'ok' } } };
    const initialVerifiers = [{ type: 'proof' }, { type: 'source' }];
    const firstResults = await executeVerifierWorkers(antigen, initialVerifiers, { allowedWorkspaceRoot: root });
    assert.equal(firstResults.results[0].receipt.independent, true);
    assert.equal(firstResults.results[1].receipt.independent, false);
    const budget = { remaining: 2 };
    const reviewed = await reArbitrateFromHomeostasis({ antigen, initialVerifiers, firstResults,
      pipeline: { decision: { assignedVerifiers: [] } },
      context: { allowedWorkspaceRoot: root, verifierBudget: budget } });
    assert.equal(reviewed.feedback.reArbitrated, true);
    const additions = reviewed.verifierResults.results.slice(2);
    assert.ok(additions.length > 0);
    assert.ok(additions.filter((row) => row.receipt).every((row) => row.receipt.independent === false),
      'a later batch using an earlier workspace must remain dependent');
    assert.equal(reviewed.pipeline.decision.assignedVerifiers.length, reviewed.verifiers.length);
    assert.ok(budget.remaining >= 0);
    console.log('AEIS re-arbitration preserves every earlier verifier workspace and the execution budget: PASS');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
