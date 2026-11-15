'use strict';

/**
 * Déploiement local des deux daemons résidents (C: et D:).
 *
 * ADR 0290 : `daemon_events` est le transport interprocessus, donc le
 * backend, l'orchestrateur et chaque daemon doivent ouvrir le même
 * fichier SQLite. Une base par daemon isole le résident de tous ses
 * producteurs d'événements : il reste vivant mais ne reçoit rien.
 */

const { resolveDatabasePath } = require('../src/db');

const DAEMONS = Object.freeze([
  Object.freeze({ drive: 'C', territoryId: 'territory.github-c', daemonId: 'daemon-local-github-c' }),
  Object.freeze({ drive: 'D', territoryId: 'territory.github-d', daemonId: 'daemon-local-github-d' })
]);

/** Base partagée : celle que résout le backend (GENOS_DB_PATH, sinon défaut). */
function sharedDatabasePath() {
  return resolveDatabasePath();
}

function launchEnvironment(baseEnv = process.env) {
  return { ...baseEnv, GENOS_DB_PATH: sharedDatabasePath(), GENOS_DB_BACKUP_SKIP: '1' };
}

module.exports = { DAEMONS, sharedDatabasePath, launchEnvironment };
