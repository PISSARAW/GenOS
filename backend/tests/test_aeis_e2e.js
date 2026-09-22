'use strict';

const assert = require('node:assert');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET || 'test-secret-e2e';

const { epistemicHolobionte } = require('../src/services/epistemic/epistemicHolobionteService');
const { evaluateReportWithAeis } = require('../src/services/epistemic/aeisPromotionBridge');
const { buildCompliantReceipt } = require('../src/services/epistemicAssuranceAssemblyBuilder');
const { adaptHolobionteResult, adaptImmuneResult } = require('../src/services/epistemic/formalResultAdapter');
const { createFormalResult } = require('../src/services/formalResultService');
const { issueReceipt, validateReceipt } = require('../src/services/epistemicVerifierReceiptService');
const { evaluateIndependence } = require('../src/services/epistemicScheduler/independencePolicy');
const { executeVerifierWithAdapter } = require('../src/services/epistemic/verifierAdapters');

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    throw err;
  }
}

async function run() {
  // 1. Holobionte produit un résultat async
  await test('Holobionte async produit un résultat structuré', async () => {
    const antigen = {
      claim: 'p < 0.05 alone suffices for statistical significance',
      epitopes: {
        evidence: { kind: 'test_result', digest: 'sha256:abc123' },
        assumptions: ['p value only'],
        validityDomain: { domain: 'stats' },
      },
      risk: { score: 0.3 },
    };
    const result = await epistemicHolobionte(antigen, {});
    assert.strictEqual(typeof result.accepted, 'boolean');
    assert.strictEqual(result.finalAuthority, 'host');
    assert.ok(result.immune, 'immune report missing');
    assert.ok(result.immune.verifierResults, 'verifierResults missing');
    assert.ok(Array.isArray(result.immune.verifierResults.results), 'verifierResults.results must be array');
  });

  // 2. Adapter Holobionte → FormalResult
  await test('Adapter Holobionte → FormalResult produit un résultat valide', () => {
    const candidate = adaptHolobionteResult({
      status: 'verified',
      claim: 'X',
      evidence: { kind: 'proof', content: { theorem: 'T' } },
    }).candidate;
    const fr = createFormalResult(candidate);
    assert.ok(fr.canonicalStatement);
    assert.ok(fr.evidence.digest);
    assert.ok(fr.resultId.startsWith('sha256:'));
  });

  // 3. Adapter rejette les statuts invalides
  await test('Adapter rejette les statuts invalides (pending → conjecture)', () => {
    const { candidate } = adaptHolobionteResult({ status: 'pending', claim: 'Y' });
    assert.strictEqual(candidate.status, 'conjecture');
  });

  // 4. Ne jamais prétendre "verified" sans preuve formelle
  await test('Adapter downgrade "verified" sans proof vers "tested"', () => {
    const { candidate } = adaptHolobionteResult({
      status: 'verified',
      claim: 'Z',
      evidence: { kind: 'observation', content: {} },
    });
    assert.strictEqual(candidate.status, 'tested');
  });

  // 5. Adapter immunitaire
  await test('Adapter immunitaire produit un FormalResult', () => {
    const immuneResult = {
      verifierResults: {
        results: [{ status: 'verified', verifierDigest: 'sha256:abc' }],
      },
      blocked: false,
    };
    const { candidate } = adaptImmuneResult(immuneResult, { claim: 'test' });
    assert.strictEqual(candidate.status, 'tested');
  });

  // 6. Adapter immunitaire : refuted
  await test('Adapter immunitaire refuted → status refuted', () => {
    const immuneResult = {
      verifierResults: {
        results: [{ status: 'refuted', verifierDigest: 'sha256:abc' }],
      },
      blocked: true,
    };
    const { candidate } = adaptImmuneResult(immuneResult, { claim: 'test' });
    assert.strictEqual(candidate.status, 'refuted');
    assert.strictEqual(candidate.evidence.kind, 'counterexample');
  });

  // 7. Receipt signé est immuable
  await test('Receipt signé est immuable (HMAC détecte la modification)', () => {
    const receipt = issueReceipt({
      resultId: 'test-1',
      evidenceDigest: 'sha256:' + 'a'.repeat(64),
      verifierDigest: 'sha256:' + 'b'.repeat(64),
      status: 'verified',
      independent: false,
    });

    assert.strictEqual(
      validateReceipt(receipt, ['sha256:' + 'b'.repeat(64)]),
      true,
      'valid receipt should pass validation'
    );

    const tampered = { ...receipt, independent: true };
    assert.strictEqual(
      validateReceipt(tampered, ['sha256:' + 'b'.repeat(64)]),
      false,
      'tampered receipt must fail validation'
    );
  });

  // 8. Builder rejette unsigned receipt
  await test('Builder rejette un receipt non signé', () => {
    const unsignedReceipt = {
      resultId: 'test-2',
      evidenceDigest: 'sha256:' + 'c'.repeat(64),
      verifierDigest: 'sha256:' + 'd'.repeat(64),
      status: 'verified',
      checkedAt: new Date().toISOString(),
      nonce: 'n1',
      independent: false,
    };
    const result = buildCompliantReceipt(unsignedReceipt, 'sha256:' + 'd'.repeat(64), ['sha256:' + 'd'.repeat(64)]);
    assert.strictEqual(result, null);
  });

  // 9. Independence Policy
  await test('Independence Policy évalue correctement', () => {
    const verifier1 = {
      actorId: 'agent-A', model: 'model-X', version: '1.0',
      strategy: 'test', evidenceSource: 'src-A', workspaceId: 'ws-1',
    };
    const verifier2 = {
      actorId: 'agent-B', model: 'model-Y', version: '1.0',
      strategy: 'replay', evidenceSource: 'src-B', workspaceId: 'ws-2',
    };
    const result = evaluateIndependence(verifier2, [verifier1]);
    assert.strictEqual(result.independent, true);
  });

  // 10. Independence Policy détecte dépendance
  await test('Independence Policy détecte workspace partagé', () => {
    const verifier1 = {
      actorId: 'agent-A', model: 'model-X', version: '1.0',
      strategy: 'test', evidenceSource: 'src-A', workspaceId: 'ws-1',
    };
    const verifier2 = {
      actorId: 'agent-A', model: 'model-X', version: '1.0',
      strategy: 'test', evidenceSource: 'src-A', workspaceId: 'ws-1',
    };
    const result = evaluateIndependence(verifier2, [verifier1]);
    assert.strictEqual(result.independent, false);
  });

  // 11. evaluateReportWithAeis → assemble automatiquement
  await test('evaluateReportWithAeis construit une assemblée', async () => {
    const report = {
      claims: [
        { statement: 'p < 0.05 alone suffices', evidence: [{ kind: 'test_result' }] },
      ],
    };
    const result = await evaluateReportWithAeis(report, {
      domain: 'stats',
      trustedVerifierDigests: [],
      immuneMemory: [],
    });
    assert.ok(result.evaluation);
    assert.ok(result.assembly);
    assert.ok(Array.isArray(result.assembly.results));
  });

  // 12. Adapters : evidence normalisée (objet → array)
  await test('Adapter coverage normalise evidence objet', async () => {
    const antigen = {
      claim: 'X',
      epitopes: {
        evidence: { kind: 'test_result', digest: 'sha256:abc' },
      },
    };
    const result = await executeVerifierWithAdapter(
      antigen,
      { type: 'coverage', coverageTarget: 0.5 },
      {}
    );
    assert.ok(result.observations.length > 0);
  });

  // 13. Adapters : claim text normalisé
  await test('Adapter behavior normalise claim objet', async () => {
    const antigen = {
      claim: { text: 'Claim text object' },
      epitopes: {
        evidence: { kind: 'test_result' },
      },
    };
    const result = await executeVerifierWithAdapter(
      antigen,
      { type: 'behavior', searchScope: 'local' },
      {}
    );
    assert.ok(result.observations.length > 0);
    assert.ok(result.observations[0].detail.claim.includes('Claim text object'));
  });

  console.log('\n✅ All E2E AEIS tests passed.');
}

run().catch(err => {
  console.error('\n✗ E2E AEIS test failed:', err.message);
  process.exit(1);
});
