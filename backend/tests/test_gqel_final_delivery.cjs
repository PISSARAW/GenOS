'use strict';
process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET = 'final-delivery-isolated-fixture-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const delivery = require('../src/services/qualityElevation/qualityFinalDelivery');
const integrity = require('../src/services/qualityElevation/qualityReceiptIntegrity');
const { digest } = require('../src/services/qualityElevation/qualityContract');
const { openDatabase } = require('./helpers/biologyDatabase');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-final-delivery-'));
  const db = openDatabase();
  try {
    const contract = delivery.contract({ qualityElevation: {}, finalArtifactOutput: { path: 'screenplay.md' } }, root);
    assert.throws(() => delivery.contract({ finalArtifactOutput: { path: 'screenplay.md' } }, root),
      { code: 'GQEL_DELIVERY_QUALITY_REQUIRED' });
    for (const name of ['../escape.md', 'sub/../../escape.md', 'screenplay.exe', 'C:\\escape.md', 'file:stream.md']) {
      assert.throws(() => delivery.assertContract({ workspaceRoot: root, path: name }), { code: 'GQEL_DELIVERY_PATH_INVALID' });
    }
    const text = 'INT. SAS - NUIT\n\nVERA\nIl reste une fermeture.\n';
    const record = integrity.sign({ schema: 'genos.gqel-final-artifact/v1', teamRunId: 'collective',
      artifactDigest: digest(text), qualityReceiptId: 'synthetic-test-only',
      artifact: { type: 'creative_candidate', content: { candidate: text } } });
    await db.exec('CREATE TABLE gqel_final_artifacts (team_run_id TEXT PRIMARY KEY, record_json TEXT)');
    await db.run('INSERT INTO gqel_final_artifacts VALUES (?, ?)', 'collective', integrity.encode(record));
    const input = { db, run: { teamRunId: 'collective', status: 'COMPLETED', finalArtifactOutput: contract },
      completion: { success: true }, finalQuality: { passed: true, artifact: record } };
    await assert.rejects(delivery.deliver({ ...input, completion: { success: false } }), { code: 'GQEL_DELIVERY_UNVERIFIED' });
    await assert.rejects(delivery.deliver({ ...input, finalQuality: { passed: false } }), { code: 'GQEL_DELIVERY_UNVERIFIED' });
    const result = await delivery.deliver(input);
    assert.equal(await fs.readFile(result.path, 'utf8'), text);
    assert.equal(result.sha256, digest(text));
    assert.deepEqual(await delivery.deliver(input), result);
    await debriefRevision(input, result);
    await fs.writeFile(result.path, 'Existing user work.');
    await assert.rejects(delivery.deliver(input), { code: 'GQEL_DELIVERY_CONFLICT' });
    assert.equal(await fs.readFile(result.path, 'utf8'), 'Existing user work.');
    assert.throws(() => delivery.assertUnchanged(input.run, { ...input.run,
      finalArtifactOutput: { ...contract, path: 'other.md' } }), { code: 'GQEL_DELIVERY_CONTRACT_CHANGED' });
    const altered = { ...record, artifactDigest: digest('unreviewed') };
    await assert.rejects(delivery.deliver({ ...input, finalQuality: { passed: true, artifact: altered } }),
      { code: 'GQEL_DELIVERY_UNVERIFIED' });
    await fs.mkdir(path.join(root, 'real'));
    await fs.symlink(path.join(root, 'real'), path.join(root, 'link'), 'junction');
    await assert.rejects(delivery.deliver({ ...input, run: { ...input.run,
      finalArtifactOutput: { ...contract, path: 'link/escape.md' } } }), /symbolic link/);
    assert.deepEqual(await fs.readdir(path.join(root, 'real')), []);
    assert.deepEqual((await fs.readdir(root)).filter(name => name.endsWith('.tmp')), []);
    console.log('Verified final delivery, byte binding, idempotency, confinement and no-overwrite: PASS');
  } finally { await db.close(); await fs.rm(root, { recursive: true, force: true }); }
}

async function debriefRevision(input, receipt) {
  const store = require('../src/services/aTeam/teamRunStore');
  const original = { load: store.load, update: store.update };
  let attempts = 0, saved;
  store.load = async () => ({ ...input.run, revision: 8 + attempts,
    execution: { debrief: { objectiveMet: true }, integration: {
      completion: input.completion, finalQuality: input.finalQuality } } });
  store.update = async options => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('Concurrent debrief'), { code: 'ATEAM_RUN_CONFLICT' });
    saved = options; return options.patch;
  };
  try {
    await delivery.record(input.db, input.run.teamRunId, receipt);
    assert.equal(saved.revision, 9);
    assert.deepEqual(saved.patch.execution.debrief, { objectiveMet: true });
    assert.deepEqual(saved.patch.execution.delivery, receipt);
    await assert.rejects(delivery.record(input.db, input.run.teamRunId, { ...receipt, sha256: 'forged' }),
      { code: 'GQEL_DELIVERY_UNVERIFIED' });
    assert.equal(attempts, 2);
  } finally { Object.assign(store, original); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
