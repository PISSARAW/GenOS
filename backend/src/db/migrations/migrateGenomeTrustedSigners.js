/**
 * Migration V016 — genome_trusted_signers table (trust store pour signatures ADN).
 */

const migration = {
  name: 'V016_genome_trusted_signers',
  description: 'Table genome_trusted_signers pour le trust store des signatures',
  run: async (db) => {
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
  },
};

const { migrationRunners } = require('./registry');
migrationRunners.push(migration);

module.exports = { migrationV016: migration };
