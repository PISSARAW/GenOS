'use strict';

const assert = require('node:assert/strict');
const { issueDelegation, attenuateDelegation, verifyDelegation } = require('../src/services/agents/biscuitDelegationService');

async function main() {
  const { Biscuit, KeyPair } = await import('@biscuit-auth/biscuit-wasm');
  const keys = new KeyPair();
  const privateKeyHex = keys.getPrivateKey().toString();
  const publicKeyHex = keys.getPublicKey().toString();
  const token = await issueDelegation({ agentId: 'sub-1', childKinds: ['bounded_worker', 'scout_cell'], expiresAt: Date.now() + 60000 }, privateKeyHex);
  const input = { token, agentId: 'sub-1', childKind: 'bounded_worker', publicKeyHex };
  assert.equal((await verifyDelegation(input)).authorized, true);
  await assert.rejects(() => verifyDelegation({ ...input, childKind: 'verifier_worker' }), { code: 'BISCUIT_DELEGATION_DENIED' });
  await assert.rejects(() => verifyDelegation({ ...input, agentId: 'sub-2' }), { code: 'BISCUIT_DELEGATION_DENIED' });
  const attenuated = await attenuateDelegation(token, 'bounded_worker', publicKeyHex);
  assert.equal((await verifyDelegation({ ...input, token: attenuated })).authorized, true);
  await assert.rejects(() => verifyDelegation({ ...input, token: attenuated, childKind: 'scout_cell' }), { code: 'BISCUIT_DELEGATION_DENIED' });
  const revokedIds = (await verifyDelegation(input)).revocationIds;
  await assert.rejects(() => verifyDelegation({ ...input, revokedIds }), { code: 'BISCUIT_DELEGATION_DENIED' });
  await assert.rejects(() => verifyDelegation({ ...input, token: token.slice(0, -8) + 'bogus' }), { code: 'BISCUIT_DELEGATION_DENIED' });
  const expiredBuilder = Biscuit.builder();
  expiredBuilder.addCode('right("sub-1", "bounded_worker"); expires_at(1);');
  const expired = expiredBuilder.build(keys.getPrivateKey()).toBase64();
  await assert.rejects(() => verifyDelegation({ ...input, token: expired }), { code: 'BISCUIT_DELEGATION_DENIED' });
  const db = { get: async () => ({ id: 'sub-1', execution_mode: 'worker', metadata_json: JSON.stringify({
    workerKind: 'sub_orchestrator', workerContract: { identity: { workerKind: 'sub_orchestrator' },
      authority: { spawn: true, delegate: true }, delegationDepth: 1, spawnBudget: 5,
      delegationExpiresAt: Date.now() + 60000 }
  }) }) };
  const previousKey = process.env.GENOS_BISCUIT_DELEGATION_PUBLIC_KEY;
  process.env.GENOS_BISCUIT_DELEGATION_PUBLIC_KEY = publicKeyHex;
  try {
    const { dispatchSubOrchestratorWorker } = require('../src/services/agents/subOrchestratorDispatchService');
    await assert.rejects(() => dispatchSubOrchestratorWorker(db, 'sub-1', { mission: 'scope check' }), { code: 'BISCUIT_DELEGATION_DENIED' });
  } finally {
    if (previousKey === undefined) delete process.env.GENOS_BISCUIT_DELEGATION_PUBLIC_KEY;
    else process.env.GENOS_BISCUIT_DELEGATION_PUBLIC_KEY = previousKey;
  }
  console.log('Biscuit delegation enforces caller, child kind, attenuation and revocation.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });