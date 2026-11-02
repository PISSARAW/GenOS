'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'mission-gqwf-fixture-only';
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'mission-gqwf-intent-fixture-only';
const assert = require('node:assert/strict');
const fixture = require('./helpers/missionGqwfFixture');
const gate = require('../src/services/strategyPromotionGate');
const bridge = require('../src/services/missionProtocols/gqwf');
const metadata = require('../src/services/missionProtocols/gqwfStore');
const roots = require('../src/services/gqwf/roots');
const { HEAD } = require('../src/services/missionProtocols/gqwfPromotion');
const { withTransaction } = require('../src/db');
const casMetadata = require('../src/services/gqwf/metadataStore');
const objects = require('../src/services/gqwf/objects');
const fs = require('node:fs/promises');
const path = require('node:path');

async function actualExchangeAndNativeHead() {
  const x = await fixture.create({ inProcess: true });
  try {
    const stored = await metadata.read(x.ctx.db, x.binding.runId);
    assert.equal(stored.baseReceipt.status, 'verified');
    assert.equal(stored.candidateReceipt.status, 'verified');
    assert.notEqual(stored.baseWorld.rootHash, stored.candidateWorld.rootHash);
    const prepared = await gate.assertProtocolPromotion(x.ctx.db, x);
    const before = await roots.getHead(x.ctx.db, { workspaceId: x.binding.workspaceId, name: HEAD });
    assert.equal(before.rootHash, stored.baseHash); assert.equal(before.generation, 0);
    assert.equal(prepared.externalEffectsAuthorized, false);
    await assert.rejects(bridge.commitReserved(x.ctx.db, { runId: x.binding.runId }), /SIGNED_RESERVED_INTENT_REQUIRED/);
    await fixture.reserve(x);
    const originalRef = await casMetadata.latestRef(x.ctx.workspace);
    await assert.rejects(withTransaction(x.ctx.db, async () => {
      await bridge.commitReserved(x.ctx.db, { runId: x.binding.runId });
      assert.deepEqual(await casMetadata.latestRef(x.ctx.workspace), originalRef, 'catalogue never publishes an uncommitted primary head');
      assert.equal((await bridge.reconcileCatalog(x.ctx.db, { runId: x.binding.runId })).status, 'catalog_pending_outer_transaction');
      throw new Error('injected native pipeline failure after head CAS');
    }), /injected native pipeline failure/);
    assert.deepEqual(await roots.getHead(x.ctx.db, { workspaceId: x.binding.workspaceId, name: HEAD }), before);
    assert.equal((await x.ctx.db.all('SELECT * FROM gqwf_head_events')).length, 0);
    const candidate = await x.ctx.db.get('SELECT state FROM gqwf_exchange_candidates');
    assert.equal(JSON.parse(candidate.state).status, 'prepared');
    await bridge.reconcileCatalog(x.ctx.db, { runId: x.binding.runId });
    assert.deepEqual(await casMetadata.latestRef(x.ctx.workspace), originalRef);
    const receipt = await bridge.commitReserved(x.ctx.db, { runId: x.binding.runId });
    assert.equal(receipt.status, 'committed'); assert.equal(receipt.externalEffectsAuthorized, false);
    const after = await roots.getHead(x.ctx.db, { workspaceId: x.binding.workspaceId, name: HEAD });
    assert.equal(after.rootHash, stored.candidateWorld.rootHash); assert.equal(after.generation, 1);
    assert.deepEqual(await casMetadata.latestRef(x.ctx.workspace), originalRef, 'checkpoint stays behind until an explicit post-commit flush');
    await bridge.reconcileCatalog(x.ctx.db, { runId: x.binding.runId });
    assert.ok((await casMetadata.latestRef(x.ctx.workspace)).revision > originalRef.revision);
    assert.deepEqual(await bridge.commitReserved(x.ctx.db, { runId: x.binding.runId }), receipt);
    assert.equal((await x.ctx.db.all('SELECT * FROM gqwf_head_events')).length, 1);
    const file = stored.candidateWorld.manifest.files.find(value => value.path === 'candidate.cjs');
    const target = objects.blobPath(x.ctx.workspace, file.hash);
    assert.ok(path.resolve(target).startsWith(path.resolve(x.ctx.root) + path.sep));
    const bytes = await fs.readFile(target);
    await fs.writeFile(target, 'tampered native CAS');
    await assert.rejects(bridge.commitReserved(x.ctx.db, { runId: x.binding.runId }), /size mismatch|integrity|digest|hash/i);
    await fs.writeFile(target, bytes);
  } finally { await x.close(); }
}

async function invalidAndUnsupportedHaveNoPublication() {
  const bad = await fixture.create({ content: 'function broken( {\n' });
  try {
    await assert.rejects(gate.assertProtocolPromotion(bad.ctx.db, bad), /SYNTAX_REFUTED/);
    assert.equal((await bad.ctx.db.all('SELECT * FROM gqwf_head_events')).length, 0);
  } finally { await bad.close(); }
  const esm = await fixture.create({ extra: { name: 'valid.mjs', content: 'export const valid = 1;\n' } });
  try {
    await assert.rejects(gate.assertProtocolPromotion(esm.ctx.db, esm), /ESM_PROFILE_NOT_INSTALLED/);
    assert.equal((await esm.ctx.db.all('SELECT * FROM gqwf_head_events')).length, 0);
  } finally { await esm.close(); }
}

async function main() {
  await actualExchangeAndNativeHead();
  await invalidAndUnsupportedHaveNoPublication();
  console.log('Mission GQWF actual CAS exchange, receiver syntax evidence and signed-intent native head CAS: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
