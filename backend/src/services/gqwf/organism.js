'use strict';

const { migrateGqwf } = require('./schema');
const { importLegacySnapshot } = require('./legacy');
const storage = require('./storage');

function invalidReference() {
  return Object.assign(new Error('GQWF snapshot reference is missing or inconsistent.'),
    { code: 'ORGANISM_GQWF_REFERENCE_INVALID', status: 409 });
}

async function captureReference(db, snapshot) {
  await migrateGqwf(db);
  const imported = await importLegacySnapshot(db, {
    workspaceId: snapshot.workspaceId, reference: snapshot.id
  });
  if (imported.legacyHash !== snapshot.hash) {
    throw new Error('GQWF root does not match the captured workspace snapshot.');
  }
  return imported.rootHash;
}

async function verifyReference(db, snapshot) {
  if (!snapshot?.gqwfRootHash) return;
  const row = await db.get(`SELECT legacy_hash, root_hash FROM gqwf_legacy_links
    WHERE workspace_id = ? AND snapshot_id = ?`, snapshot.workspaceId, snapshot.id);
  if (row?.legacy_hash !== snapshot.hash || row.root_hash !== snapshot.gqwfRootHash) {
    throw invalidReference();
  }
  try {
    await storage.root(db, snapshot.workspaceId, snapshot.gqwfRootHash);
  } catch (_) {
    throw invalidReference();
  }
}

module.exports = { captureReference, verifyReference };
