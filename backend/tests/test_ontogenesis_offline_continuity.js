'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { memoryDb } = require('./ontogenesisFixture');
const { createProject } = require('../src/services/ontogenesis/projectStore');
const pairing = require('../src/services/ontogenesis/pairingService');
const continuity = require('../src/services/ontogenesis/continuityService');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { runResidentLoop } = require('../src/services/ontogenesis/residentLoopService');

async function paired(db, input) {
  const pending = await pairing.createPairing(db, input);
  return pairing.claimPairing(db, { projectId: input.projectId, code: pending.code });
}

async function fixture(filename = ':memory:') {
  const db = await memoryDb(filename);
  const projectId = 'continuity-project';
  await createProject(db, {
    id: projectId, rootPath: 'D:\\GenOS-continuity', branch: 'codex/ontogenesis',
    objective: 'continuer hors ligne'
  });
  const local = await paired(db, { projectId, role: 'local', endpoint: 'pc-local' });
  const remote = await paired(db, { projectId, role: 'controller', endpoint: 'host-24-7',
    capabilities: { durableStoreId: 'volume-onto-1' } });
  return { db, projectId, local, remote };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-continuity-'));
  const filename = path.join(root, 'continuity.db');
  let { db, projectId, local, remote } = await fixture(filename);

  await assert.rejects(continuity.prepareHandoff(db, {
    projectId, targetHostId: remote.hostId, storeId: 'autre-volume'
  }), /stockage-durable-incompatible/);
  await db.run(`INSERT INTO ontogenesis_claims (project_id, owner, operation_id, expires_at)
    VALUES (?, 'test', 'active-operation', '2099-01-01T00:00:00.000Z')`, [projectId]);
  await assert.rejects(continuity.prepareHandoff(db, {
    projectId, targetHostId: remote.hostId, storeId: 'volume-onto-1'
  }), /bascule-claim-actif/);
  await db.run('DELETE FROM ontogenesis_claims WHERE project_id = ?', [projectId]);

  const prepared = await continuity.prepareHandoff(db, {
    projectId, sourceHostId: local.hostId, targetHostId: remote.hostId,
    storeId: 'volume-onto-1', nowMs: 1000, ttlMs: 60000
  });
  assert.strictEqual(prepared.generation, 1);
  const persisted = await db.get('SELECT * FROM ontogenesis_handoffs WHERE id = ?', [prepared.handoffId]);
  assert.notStrictEqual(persisted.token_hash, prepared.token);
  assert.strictEqual(JSON.parse(persisted.manifest_json).durableStoreId, 'volume-onto-1');

  const localDuringHandoff = await tickOnce(db, { projectId, owner: 'local-before-transfer' });
  assert.deepStrictEqual(localDuringHandoff, { ticked: false, reason: 'bascule-en-attente' });
  const stoppedLoop = await runResidentLoop(db, { projectId, intervalMs: 10 }, {
    tick: async () => localDuringHandoff, onChange: async () => {}
  });
  assert.strictEqual(stoppedLoop.count, 1);
  await assert.rejects(continuity.acceptHandoff(db, {
    projectId, handoffId: prepared.handoffId, hostId: remote.hostId,
    token: 'incorrect', nowMs: 2000
  }), /jeton-bascule-invalide/);

  const accepted = await continuity.acceptHandoff(db, {
    projectId, handoffId: prepared.handoffId, hostId: remote.hostId,
    token: prepared.token, nowMs: 2000, leaseTtlMs: 5000
  });
  await assert.rejects(continuity.acceptHandoff(db, {
    projectId, handoffId: prepared.handoffId, hostId: remote.hostId,
    token: prepared.token, nowMs: 2001
  }), /bascule-non-disponible/);
  assert.strictEqual(accepted.generation, 1);
  await db.close();

  db = await memoryDb(filename);
  const afterRestart = await continuity.getContinuity(db, projectId);
  assert.strictEqual(afterRestart.state.state, 'remote_active');
  const localDenied = await tickOnce(db, { projectId, owner: 'local-after-transfer' });
  assert.strictEqual(localDenied.reason, 'controleur-continuite-invalide');
  const staleDenied = await continuity.authorizeTick(db, {
    projectId, hostId: remote.hostId, generation: 0, nowMs: 3000
  });
  assert.strictEqual(staleDenied.reason, 'controleur-continuite-invalide');
  const remoteAllowed = await continuity.authorizeTick(db, {
    projectId, hostId: remote.hostId, generation: 1, nowMs: 3000, leaseTtlMs: 5000
  });
  assert.strictEqual(remoteAllowed.allowed, true);
  await assert.rejects(continuity.reclaimLocal(db, {
    projectId, hostId: local.hostId, nowMs: 4000
  }), /reprise-interdite-lease-active/);

  const expired = await continuity.authorizeTick(db, {
    projectId, hostId: remote.hostId, generation: 1, nowMs: 9000
  });
  assert.deepStrictEqual(expired, { allowed: false, reason: 'lease-continuite-expire' });
  await assert.rejects(continuity.reclaimLocal(db, {
    projectId, hostId: remote.hostId, nowMs: 9001
  }), /hote-reprise-non-local/);
  const reclaimed = await continuity.reclaimLocal(db, {
    projectId, hostId: local.hostId, nowMs: 9001
  });
  assert.strictEqual(reclaimed.generation, 2);
  const oldRemote = await continuity.authorizeTick(db, {
    projectId, hostId: remote.hostId, generation: 1, nowMs: 9002
  });
  assert.strictEqual(oldRemote.allowed, false);
  const localAllowed = await continuity.authorizeTick(db, {
    projectId, hostId: local.hostId, generation: 2, nowMs: 9002
  });
  assert.strictEqual(localAllowed.allowed, true);
  await assert.rejects(continuity.reclaimLocal(db, {
    projectId, hostId: local.hostId, nowMs: 9003
  }), /continuite-deja-locale/);
  const receipts = await db.all(
    'SELECT kind FROM ontogenesis_continuity_receipts WHERE project_id = ? ORDER BY rowid', [projectId]
  );
  assert.deepStrictEqual(receipts.map((row) => row.kind),
    ['handoff_prepared', 'handoff_accepted', 'lease_expired', 'local_reclaimed']);
  await db.close();
  fs.rmSync(root, { recursive: true, force: true });
  console.log('ontogenesis offline continuity checks passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
