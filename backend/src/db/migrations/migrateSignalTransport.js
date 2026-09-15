/**
 * Migration v45 — Zero-Text Signaling Transport Tables
 *
 * Ajoute signal_blobs (signaux zero-texte persistés) et signal_subs
 * (abonnements agents → topics) au schéma SQLite.
 *
 * Idempotente : les CREATE TABLE IF NOT EXISTS garantissent l'absence
 * d'effet secondaire sur un schéma déjà à jour.
 */

const { applyV45Migration } = require('../schema-next');

module.exports = {
  name: '021-signal-transport',
  description: 'Add zero-text signaling tables (signal_blobs, signal_subs)',
  run: async (db) => {
    await applyV45Migration(db);
  },
};
