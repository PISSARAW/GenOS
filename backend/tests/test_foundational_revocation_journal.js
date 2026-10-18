'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const journal = require('../src/services/foundationalRevocationJournal');
const revocations = require('../src/services/foundationalRevocationAuthority');

const NOW = '2026-10-18T14:00:00.000Z';
const STREAM = 'foundational-qualification';

async function database(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  return db;
}

function authority() {
  const pair = crypto.generateKeyPairSync('ed25519');
  return { privateKey: pair.privateKey, trustRegistry: {
    schema: revocations.TRUST_SCHEMA, authorities: [{ id: 'release-authority',
      status: 'active', publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }) }] } };
}

function entry(context) {
  return revocations.issue({ receiptHash: context.receiptHash,
    authorityId: 'release-authority', reason: context.reason,
    revokedAt: '2026-10-18T13:59:00.000Z', sequence: context.sequence,
    previousHash: context.previousHash, privateKey: context.privateKey });
}

function appendInput(context) {
  return { db: context.db, anchorDb: context.anchorDb, streamId: STREAM,
    entry: context.entry, expectedSequence: context.expectedSequence,
    expectedHeadHash: context.expectedHeadHash,
    trustRegistry: context.trustRegistry, now: NOW };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-revocation-journal-'));
  const dbs = await openDatabases(root);
  const signer = authority();
  try {
    const first = entry({ sequence: 1, previousHash: revocations.GENESIS_HASH,
      receiptHash: 'a'.repeat(64), reason: 'first', privateKey: signer.privateKey });
    const firstInput = appendInput({ db: dbs.source, anchorDb: dbs.sourceAnchor,
      entry: first, expectedSequence: 0, expectedHeadHash: revocations.GENESIS_HASH,
      trustRegistry: signer.trustRegistry });
    const committed = await journal.append(firstInput);
    assert.equal(committed.anchored, true);
    assert.equal((await journal.append(firstInput)).duplicate, true,
      'exact replay must be idempotent');
    await verifyTamperedReplay(dbs, firstInput, first);

    const second = entry({ sequence: 2, previousHash: first.entryHash,
      receiptHash: 'b'.repeat(64), reason: 'second', privateKey: signer.privateKey });
    const rival = entry({ sequence: 2, previousHash: first.entryHash,
      receiptHash: 'c'.repeat(64), reason: 'rival', privateKey: signer.privateKey });
    await journal.append(appendInput({ db: dbs.source, anchorDb: dbs.sourceAnchor,
      entry: second, expectedSequence: 1, expectedHeadHash: first.entryHash,
      trustRegistry: signer.trustRegistry }));
    await assert.rejects(journal.append(appendInput({ db: dbs.source,
      anchorDb: dbs.sourceAnchor, entry: rival, expectedSequence: 1,
      expectedHeadHash: first.entryHash, trustRegistry: signer.trustRegistry })),
    { code: 'FOUNDATION_REVOCATION_CAS_CONFLICT' });

    await verifyCrashRecovery(dbs, signer, second);
    await verifyReplication(dbs, signer);
    await verifyRollbackDetection(dbs, signer);
    console.log('Foundational revocation journal: CAS, recovery, rollback and replication PASS.');
  } finally {
    const connections = Object.values(dbs).filter((value) => typeof value?.close === 'function');
    await Promise.all(connections.map((db) => db.close()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function verifyTamperedReplay(dbs, firstInput, first) {
  const tampered = { ...first, signature: Buffer.alloc(64).toString('base64') };
  await dbs.source.run(`UPDATE foundational_revocation_entries SET entry_json = ?
    WHERE stream_id = ? AND sequence = 1`, JSON.stringify(tampered), STREAM);
  await assert.rejects(journal.append(firstInput),
    { code: 'FOUNDATION_REVOCATION_SIGNATURE_INVALID' });
  await dbs.source.run(`UPDATE foundational_revocation_entries SET entry_json = ?
    WHERE stream_id = ? AND sequence = 1`, JSON.stringify(first), STREAM);
}

async function verifyCrashRecovery(dbs, signer, second) {
  const third = entry({ sequence: 3, previousHash: second.entryHash,
    receiptHash: 'd'.repeat(64), reason: 'crash-window', privateKey: signer.privateKey });
  await journal.appendLocal(appendInput({ db: dbs.source, anchorDb: dbs.sourceAnchor,
    entry: third, expectedSequence: 2, expectedHeadHash: second.entryHash,
    trustRegistry: signer.trustRegistry }));
  await dbs.source.close();
  dbs.source = await database(dbs.sourcePath);
  await assert.rejects(journal.inspect({ db: dbs.source, anchorDb: dbs.sourceAnchor,
    streamId: STREAM, trustRegistry: signer.trustRegistry, now: NOW }),
  { code: 'FOUNDATION_REVOCATION_ROLLBACK_DETECTED' });
  const recovered = await journal.recoverAnchor({ db: dbs.source,
    anchorDb: dbs.sourceAnchor, streamId: STREAM,
    trustRegistry: signer.trustRegistry, now: NOW });
  assert.equal(recovered.head.sequence, 3);
}

async function verifyReplication(dbs, signer) {
  const input = { sourceDb: dbs.source, sourceAnchorDb: dbs.sourceAnchor,
    targetDb: dbs.replica, targetAnchorDb: dbs.replicaAnchor, streamId: STREAM,
    trustRegistry: signer.trustRegistry, now: NOW };
  const replicated = await journal.replicate(input);
  assert.equal(replicated.sequence, 3);
  assert.equal((await journal.replicate(input)).sequence, 3,
    'replication replay must remain idempotent');

  const divergent = entry({ sequence: 1, previousHash: revocations.GENESIS_HASH,
    receiptHash: 'e'.repeat(64), reason: 'divergent', privateKey: signer.privateKey });
  await journal.append(appendInput({ db: dbs.divergent, anchorDb: dbs.divergentAnchor,
    entry: divergent, expectedSequence: 0, expectedHeadHash: revocations.GENESIS_HASH,
    trustRegistry: signer.trustRegistry }));
  await assert.rejects(journal.replicate({ ...input, targetDb: dbs.divergent,
    targetAnchorDb: dbs.divergentAnchor }),
  { code: 'FOUNDATION_REVOCATION_DIVERGENCE' });
}

async function verifyRollbackDetection(dbs, signer) {
  await dbs.replica.exec('BEGIN IMMEDIATE');
  try {
    await dbs.replica.run(`DELETE FROM foundational_revocation_entries
      WHERE stream_id = ? AND sequence = 3`, STREAM);
    const row = await dbs.replica.get(`SELECT entry_hash AS entryHash
      FROM foundational_revocation_entries WHERE stream_id = ? AND sequence = 2`, STREAM);
    await dbs.replica.run(`UPDATE foundational_revocation_heads
      SET sequence = 2, head_hash = ?, revision = revision + 1 WHERE stream_id = ?`,
    row.entryHash, STREAM);
    await dbs.replica.exec('COMMIT');
  } catch (error) {
    await dbs.replica.exec('ROLLBACK');
    throw error;
  }
  await assert.rejects(journal.inspect({ db: dbs.replica,
    anchorDb: dbs.replicaAnchor, streamId: STREAM,
    trustRegistry: signer.trustRegistry, now: NOW }),
  { code: 'FOUNDATION_REVOCATION_ROLLBACK_DETECTED' });
}

async function openDatabases(root) {
  const sourcePath = path.join(root, 'source.db');
  return { sourcePath, source: await database(sourcePath),
    sourceAnchor: await database(path.join(root, 'source-anchor.db')),
    replica: await database(path.join(root, 'replica.db')),
    replicaAnchor: await database(path.join(root, 'replica-anchor.db')),
    divergent: await database(path.join(root, 'divergent.db')),
    divergentAnchor: await database(path.join(root, 'divergent-anchor.db')) };
}

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { main };
