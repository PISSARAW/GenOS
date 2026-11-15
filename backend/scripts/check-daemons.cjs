#!/usr/bin/env node
'use strict';

/**
 * Affiche l'état de supervision des deux daemons dans la base partagée (ADR 0290).
 * Usage : node backend/scripts/check-daemons.cjs   (depuis n'importe quel répertoire)
 */

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Une simple sonde ne doit pas déclencher la sauvegarde de démarrage de la
// base opérationnelle, qui peut prendre près d'une minute et ressemble alors
// à un blocage de la supervision.
process.env.GENOS_DB_BACKUP_SKIP = '1';

// Charge le .env de la racine pour GENOS_ADMIN_PASSWORD (requis par l'initialisation SQLite)
const envPath = path.join(REPO_ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const { listDaemonHealth } = require('../src/services/daemon/daemonSupervisorService');
const { getDatabase, closeDatabase } = require('../src/db');
const deployment = require('./daemonDeployment.cjs');

async function checkDatabase(dbPath, label) {
  if (!fs.existsSync(dbPath)) {
    return { label, dbPath, error: 'database-missing',
      orphanedSidecars: ['-wal', '-shm'].filter((suffix) => fs.existsSync(dbPath + suffix)) };
  }
  const db = await getDatabase(dbPath);
  const health = await listDaemonHealth(db);
  await closeDatabase();
  return { label, dbPath, health };
}

(async () => {
  const results = [];
  for (const [dbPath, label] of [[deployment.sharedDatabasePath(), 'C: + D:']]) {
    try {
      results.push(await checkDatabase(dbPath, label));
    } catch (err) {
      results.push({ label, dbPath, error: err.message });
    }
  }

  console.log('=== Supervision des daemons (base partagée) ===');
  for (const r of results) {
    console.log(`\n[${r.label}] ${r.dbPath}`);
    if (r.error) {
      console.log(`  Erreur: ${r.error}`);
    } else {
      console.log(JSON.stringify(r.health, null, 2));
    }
  }
})().catch((err) => {
  process.stderr.write(`Erreur : ${err.message}\n`);
  process.exit(1);
});
