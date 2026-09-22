/**
 * Migration V017 — genome_events.commit_id (pont avec agent_git).
 *
 * Ajoute une colonne commit_id à genome_events pour lier les événements
 * ADN aux commits Git qui les ont introduits.
 */

const migration = {
  name: 'V017_genome_event_commit_id',
  description: 'Colonne commit_id dans genome_events (lien avec agent_git)',
  run: async (db) => {
    const cols = new Set((await db.all('PRAGMA table_info(genome_events)')).map(c => c.name));
    if (!cols.has('commit_id')) {
      await db.exec(`ALTER TABLE genome_events ADD COLUMN commit_id TEXT;`);
    }
  },
};

const { migrationRunners } = require('./registry');
migrationRunners.push(migration);

module.exports = { migrationV017: migration };
