/**
 * Genome Trust Store — gestion des clés de signature approuvées par tenant.
 *
 * Table: genome_trusted_signers
 * Invariant : un génome signé par une clé non approuvée est rejeté dans un scope protégé
 */

async function ensureTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS genome_trusted_signers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      valid_until DATETIME,
      revoked_at DATETIME,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (tenant_id, key_id)
    );
    CREATE INDEX IF NOT EXISTS idx_genome_trusted_signers_tenant ON genome_trusted_signers(tenant_id, status);
  `);
}

async function addTrustedSigner({ db, tenant, keyId, publicKey, opts }) {
  const { validUntil, comment } = opts || {};
  const id = `ts_${tenant}_${keyId}_${Date.now()}`;
  await db.run(
    `INSERT INTO genome_trusted_signers (id, tenant_id, key_id, public_key, valid_until, comment)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, key_id) DO UPDATE SET
       public_key = excluded.public_key,
       status = 'active',
       valid_until = excluded.valid_until,
       revoked_at = NULL,
       comment = excluded.comment`,
    id, tenant, keyId, publicKey, validUntil || null, comment || null
  );
  return { id, tenant, keyId, status: 'active' };
}

async function revokeSigner(db, tenant, keyId) {
  await db.run(
    `UPDATE genome_trusted_signers SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND key_id = ?`,
    tenant, keyId
  );
  return { tenant, keyId, status: 'revoked' };
}

async function isSignerTrusted(db, tenant, signerKey) {
  if (!signerKey) return false;
  const row = await db.get(
    `SELECT 1 FROM genome_trusted_signers
     WHERE tenant_id = ? AND public_key = ? AND status = 'active'
     AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
     LIMIT 1`,
    tenant, signerKey
  );
  return Boolean(row);
}

async function listTrustedSigners(db, tenant) {
  return db.all(
    `SELECT id, tenant_id, key_id, public_key, status, valid_from, valid_until, revoked_at, comment
     FROM genome_trusted_signers WHERE tenant_id = ? ORDER BY created_at DESC`,
    tenant
  );
}

module.exports = {
  ensureTable,
  addTrustedSigner,
  revokeSigner,
  isSignerTrusted,
  listTrustedSigners
};
