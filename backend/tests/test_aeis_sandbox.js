'use strict';

/**
 * E2E AEIS pipeline test — sandbox + independence.
 *
 * Scénario : exécution réelle via sandboxExecutor,
 * independencePolicy branchée avant issueReceipt,
 * receipts immuables portant l'indépendance.
 */

const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('node:fs');

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET || 'test-secret-e2e';

const { runIsolated, DEFAULT_TIMEOUT_MS } = require('../src/services/sandboxExecutor');
const { epistemicHolobionte } = require('../src/services/epistemic/epistemicHolobionteService');
const { evaluateVerifierIndependence, executeVerifierWorkers } = require('../src/services/epistemic/verifierRuntimeBridge');
const { adaptHolobionteResult, adaptImmuneResult } = require('../src/services/epistemic/formalResultAdapter');
const { createFormalResult } = require('../src/services/formalResultService');
const { issueReceipt, validateReceipt, signatureFor } = require('../src/services/epistemicVerifierReceiptService');
const { evaluateIndependence } = require('../src/services/epistemicScheduler/independencePolicy');
const { runTestAdapter, runArtifactAdapter } = require('../src/services/epistemic/verifierAdapters');

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
  // 1. sandboxExecutor exécute réellement une commande autorisée
  await test('sandboxExecutor exécute npm test', async () => {
    // Create a minimal package.json with a passing test script
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-sandbox-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-proj',
      version: '1.0.0',
      scripts: { test: 'echo "test passed"' },
    }));

    const result = await runIsolated({
      command: 'npm test',
      cwd: tmpDir,
      timeoutMs: 30000,
    });

    assert.strictEqual(result.exitCode, 0, `expected exit 0, got ${result.exitCode}`);
    assert.strictEqual(result.success, true);
    assert.ok(result.durationMs >= 0);
    assert.ok(result.commandHash.startsWith('sha256:'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 2. sandboxExecutor rejette une commande non-whitelisted
  await test('sandboxExecutor rejette rm -rf /', async () => {
    let threw = false;
    try {
      await runIsolated({ command: 'rm -rf /', timeoutMs: 5000 });
    } catch (err) {
      threw = true;
      assert.ok(err.message.includes('whitelist') || err.message.includes('not in sandbox'));
    }
    assert.strictEqual(threw, true, 'should reject non-whitelisted command');
  });

  // 3. sandboxExecutor détecte un échec de test
  await test('sandboxExecutor détecte exitCode != 0', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-sandbox-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-proj-fail',
      scripts: { test: 'echo "fail" && exit 1' },
    }));

    const result = await runIsolated({
      command: 'npm test',
      cwd: tmpDir,
      timeoutMs: 15000,
    });

    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.success, false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 4. runTestAdapter exécute réellement via sandboxExecutor
  await test('runTestAdapter exécute réellement la commande', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-test-adapter-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-proj-adapter',
      scripts: { test: 'echo "adapter test ok"' },
    }));

    const antigen = {
      claim: 'X is true',
      epitopes: { evidence: { kind: 'test_result' } },
    };
    const verifier = {
      type: 'test',
      test: { command: 'npm test', cwd: tmpDir },
    };

    const result = await runTestAdapter(antigen, verifier, {});
    assert.strictEqual(result.status, 'verified');
    assert.ok(result.observations.length > 0);
    const obs = result.observations.find(o => o.step === 'test:execute');
    assert.ok(obs, 'should have test:execute observation');
    assert.strictEqual(obs.result, 'executed');
    assert.ok(obs.detail.commandHash.startsWith('sha256:'));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 5. runArtifactAdapter exécute réellement le build
  await test('runArtifactAdapter exécute le build', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-artifact-'));
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'test-proj-build',
      scripts: { check: 'echo "check ok"' },
    }));

    const antigen = {
      claim: 'Y builds',
      epitopes: { evidence: { kind: 'reproducible_artifact' } },
    };
    const verifier = {
      type: 'artifact',
      artifact: { buildCommand: 'npm run check', cwd: tmpDir, type: 'npm-check' },
    };

    const result = await runArtifactAdapter(antigen, verifier, {});
    assert.strictEqual(result.status, 'verified');
    assert.ok(result.observations.length > 0);
    const buildObs = result.observations.find(o => o.step.startsWith('artifact:') && o.result === 'executed');
    assert.ok(buildObs, 'should have artifact:execute observation');
    assert.strictEqual(buildObs.result, 'executed');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // 6. independencePolicy intégrée dans le bridge
  await test('independencePolicy évalue avant signature', () => {
    const v1 = { type: 'test', strategy: ['unit'] };
    const v2 = { type: 'replay', strategy: ['replay'] };
    const antigen = { id: 'claim-1' };

    const ind1 = evaluateVerifierIndependence(v1, antigen, []);
    assert.strictEqual(ind1.independent, true, 'first verifier is always independent');

    const ind2 = evaluateVerifierIndependence(v2, antigen, [v1]);
    assert.strictEqual(ind2.independent, true, 'different type/strategy → independent');
  });

  // 7. independencePolicy détecte dépendance dans le bridge
  await test('independencePolicy détecte dépendance dans le bridge', () => {
    const v1 = { type: 'test', strategy: ['unit'] };
    const v2 = { type: 'test', strategy: ['unit'] };
    const antigen = { id: 'claim-1' };

    const ind2 = evaluateVerifierIndependence(v2, antigen, [v1]);
    assert.strictEqual(ind2.independent, false, 'same type+strategy → dependent');
  });

  // 8. executeVerifierWorkers signe avec indépendance
  await test('executeVerifierWorkers signe receipt avec indépendance', async () => {
    const antigen = {
      id: 'claim-indep',
      claim: 'Z',
      epitopes: { evidence: { kind: 'test_result', digest: 'sha256:abc' } },
    };
    const verifiers = [
      { type: 'test', strategy: ['unit'] },
    ];

    const result = await executeVerifierWorkers(antigen, verifiers, { timeoutMs: 15000 });
    assert.ok(result.results.length > 0);
    const r = result.results[0];
    assert.ok(r.receipt);
    assert.ok(r.receipt.signature);
    assert.strictEqual(r.receipt.independent, true);
    assert.ok(r.receipt.independenceDescriptor);
  });

  // 9. Receipt signé portant l'indépendance est valide
  await test('Receipt portant indépendance est valide', () => {
    const receipt = issueReceipt({
      resultId: 'r1',
      evidenceDigest: 'sha256:' + 'a'.repeat(64),
      verifierDigest: 'sha256:' + 'b'.repeat(64),
      status: 'verified',
      independent: true,
      independenceDescriptor: { actorId: 'verifier-test', model: 'test', version: '1.0', strategy: 'unit', evidenceSource: 'src', workspaceId: 'ws-1' },
      independenceDistance: 6,
    });

    assert.ok(receipt.signature);
    assert.strictEqual(
      validateReceipt(receipt, ['sha256:' + 'b'.repeat(64)]),
      true
    );

    // Modifier l'indépendance après signature → invalid
    const tampered = { ...receipt, independent: false };
    assert.strictEqual(
      validateReceipt(tampered, ['sha256:' + 'b'.repeat(64)]),
      false,
      'tampered independence must fail validation'
    );
  });

  console.log('\n✅ All E2E AEIS sandbox + independence tests passed.');
}

run().catch(err => {
  console.error('\n✗ E2E test failed:', err.message);
  process.exit(1);
});
