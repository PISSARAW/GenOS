#!/usr/bin/env node
'use strict';

/**
 * Lance deux daemons résidents (un sur C:, un sur D:) en arrière-plan détaché.
 * Usage : node backend/scripts/start-daemons.cjs [<cheminRepoC> <cheminRepoD>]
 * Les processus sont détournés (détachés) pour survivre à la fin du script.
 * Les deux daemons ouvrent la base partagée du backend (ADR 0290) : c'est
 * dans son journal `daemon_events` que les producteurs livrent les événements.
 */

const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const deployment = require('./daemonDeployment.cjs');

const repoRoot = path.resolve(__dirname, '../..');
const daemonBin = path.join(repoRoot, 'backend', 'bin', 'genos-daemon.cjs');
const logDir = path.join(repoRoot, '.genos', 'daemon-logs');

function assertRepository(repoPath) {
  const resolved = fs.realpathSync(repoPath);
  execFileSync('git', ['-C', resolved, 'rev-parse', '--git-dir'], {
    stdio: 'ignore', windowsHide: true
  });
  return resolved;
}

function assertIdentityAvailable(dbPath, daemonId) {
  const db = new Database(dbPath, { readonly: true });
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_identity_heads'").get();
  const head = table ? db.prepare('SELECT lease_until FROM agent_identity_heads WHERE agent_id = ?').get(daemonId) : null;
  db.close();
  if (head?.lease_until > Date.now()) {
    throw new Error(`${daemonId} est encore protégé par un bail actif jusqu'à ${new Date(head.lease_until).toISOString()}`);
  }
}

function storedRepositoryPaths() {
  const dbPath = deployment.sharedDatabasePath();
  if (!fs.existsSync(dbPath)) throw new Error(`Base partagée absente: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });
  try {
    return Object.fromEntries(deployment.DAEMONS.map((daemon) => {
      const row = db.prepare('SELECT root_path FROM daemon_territories WHERE id = ?').get(daemon.territoryId);
      if (!row?.root_path) throw new Error(`Territoire ${daemon.territoryId} absent de la base partagée`);
      return [daemon.drive, row.root_path];
    }));
  } finally {
    db.close();
  }
}

function repositoryPaths() {
  const supplied = process.argv.slice(2);
  if (supplied.length === 0) return storedRepositoryPaths();
  if (supplied.length !== 2) throw new Error('Usage: node start-daemons.cjs [<cheminRepoC> <cheminRepoD>]');
  return { C: supplied[0], D: supplied[1] };
}

function prepare(spec) {
  const resolvedRepo = assertRepository(spec.repoPath);
  const dbPath = deployment.sharedDatabasePath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Base partagée absente pour ${spec.daemonId}: ${dbPath}. Exécutez setup-daemon-databases.cjs.`);
  }
  assertIdentityAvailable(dbPath, spec.daemonId);
  return { ...spec, resolvedRepo, dbPath };
}

function launch(spec) {
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.openSync(path.join(logDir, `${spec.daemonId}.log`), 'a');
  const child = spawn(process.execPath, [daemonBin, '--territory', spec.territoryId, '--daemon-id', spec.daemonId], {
    cwd: repoRoot,
    env: deployment.launchEnvironment(),
    windowsHide: true,
    detached: true,
    stdio: ['ignore', log, log]
  });
  const result = { child, spec, error: null };
  child.once('error', (error) => {
    result.error = error;
    process.stderr.write(`[start-daemons] ${spec.daemonId}: ${error.message}\n`);
  });
  child.unref();
  fs.closeSync(log);
  return result;
}

async function verifyLaunches(launches) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  for (const item of launches) {
    if (item.error) throw item.error;
    if (item.child.exitCode !== null) throw new Error(`${item.spec.daemonId} a quitté avec le code ${item.child.exitCode}`);
    console.log(`[start-daemons] daemon ${item.spec.daemonId} actif (PID ${item.child.pid}) sur ${item.spec.territoryId} (${item.spec.drive}: ${item.spec.resolvedRepo})`);
  }
}

async function main() {
  const repoPaths = repositoryPaths();
  const specs = deployment.DAEMONS.map((daemon) => ({ ...daemon, repoPath: repoPaths[daemon.drive] }));
  const launches = specs.map(prepare).map(launch);
  await verifyLaunches(launches);
  console.log(`[start-daemons] Base partagée : ${deployment.sharedDatabasePath()}`);
  console.log('[start-daemons] Les deux daemons tournent en arrière-plan. Vérification : node backend/scripts/check-daemons.cjs');
}

main().catch((error) => {
  process.stderr.write(`[start-daemons] Échec: ${error.message}\n`);
  process.exitCode = 1;
});
