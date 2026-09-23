'use strict';

/**
 * Migration 042 — detector_id sur daemon_findings (ADR 0034 D9).
 *
 * Le Verifier applique des règles de vérification par détecteur
 * (une récupération de test réfute test-regression mais confirme
 * flaky-signal). Sans cette colonne, il devrait parser les claims.
 */

async function migrateDaemonFindingDetector(db) {
  const columns = await db.all('PRAGMA table_info(daemon_findings)');
  const hasDetector = (columns || []).some((col) => col.name === 'detector_id');
  if (!hasDetector) {
    await db.exec('ALTER TABLE daemon_findings ADD COLUMN detector_id TEXT');
  }
}

module.exports = { migrateDaemonFindingDetector };
