'use strict';

const assert = require('assert');
const fixture = require('./ontogenesisFixture');
const proofService = require('../src/services/ontogenesis/proofService');
const { verifyChecks } = proofService;

async function main() {
  const root = await fixture.repository();
  const names = ['GENOS_GVX_LEDGER_HMAC_SECRET', 'GENOS_EPISTEMIC_RECEIPT_SECRET', 'GENOS_DB_PATH'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) process.env[name] = `fixture-secret-${name}`;
  try {
    const script = `for (const name of ${JSON.stringify(names)}) { if (process.env[name]) process.exit(41); }`;
    const proof = await verifyChecks(root, [{ program: process.execPath, args: ['-e', script],
      trustMode: 'operator_trusted_host' }], { timeoutMs: 30000 });
    assert.strictEqual(proof.proofs.length, 1);
    assert.strictEqual(proof.proofs[0].exitCode, 0);
    assert.deepStrictEqual(proof.proofs[0].verificationEvidence,
      { runtime: 'host', trustMode: 'operator_trusted_host' });
    assert.deepStrictEqual(proofService.validateProofs(proof,
      [{ program: process.execPath, args: ['-e', script], trustMode: 'operator_trusted_host' }]), []);
    const forged = { ...proof, proofs: [{ ...proof.proofs[0],
      verificationEvidence: { runtime: 'host', trustMode: 'implicit' } }] };
    assert.deepStrictEqual(proofService.validateProofs(forged,
      [{ program: process.execPath, args: ['-e', script], trustMode: 'operator_trusted_host' }]), ['preuve-invalide']);
    let untrustedRan = false;
    await assert.rejects(verifyChecks(root, [{ program: process.execPath, args: ['-e', script] }], {
      run: async () => { untrustedRan = true; }
    }), /verification-hote-confiance-operateur-requise/);
    assert.strictEqual(untrustedRan, false, 'an undeclared host check is refused before execution');
    let forbiddenCommandRan = false;
    await assert.rejects(verifyChecks(root, [{ program: 'git', args: ['fetch', 'origin'],
      trustMode: 'operator_trusted_host' }], {
      run: async () => { forbiddenCommandRan = true; }
    }), /verification-git-fetch-hors-autorite/);
    assert.strictEqual(forbiddenCommandRan, false, 'unsafe Git check must be rejected before host execution');
    console.log('Ontogenesis verifier receives a minimal environment without orchestration secrets.');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    require('fs').rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
