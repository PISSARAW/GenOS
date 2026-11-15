#!/usr/bin/env node
'use strict';

/**
 * Enregistre les deux territoires daemon dans la base partagée du backend
 * (ADR 0290 : producteurs d'événements et daemons lisent le même fichier).
 * Usage : node backend/scripts/setup-daemon-databases.cjs <cheminRepoC> <cheminRepoD>
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const { getDatabase, closeDatabase, withTransaction } = require('../src/db');
const territoryService = require('../src/services/daemon/daemonTerritoryService');
const deployment = require('./daemonDeployment.cjs');

function gitHeadSha(repoPath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  } catch (_) {
    return null;
  }
}

async function setupTerritory(db, { territoryId, repoPath, driveLabel }) {
  const resolvedRepo = fs.realpathSync(repoPath);
  const headSha = gitHeadSha(resolvedRepo);
  if (!headSha) {
    throw new Error(`Impossible de lire le HEAD git pour ${driveLabel}: ${resolvedRepo}`);
  }
  const input = {
    id: territoryId,
    organizationId: 'org-local',
    projectId: 'github-local',
    workspaceId: 'ws-pc',
    repoIdentity: `file://${resolvedRepo.replace(/\\/g, '/')}`,
    rootPath: resolvedRepo,
    scopePath: '/',
    ref: 'main',
    headSha,
    state: 'ACTIVE',
    metadata: { source: 'local-pc', drive: driveLabel }
  };
  let t = await territoryService.createTerritory(db, input);
  if (t.errors?.includes('territory-conflict')) t = await rebindTerritory(db, input);
  if (!t.found) throw new Error(`Territoire ${territoryId} refusé: ${(t.errors || ['unknown']).join(', ')}`);
  console.log(`[${driveLabel}] Territoire ${territoryId} prêt (HEAD ${headSha.slice(0, 12)}...)`);
  return t;
}

async function rebindTerritory(db, input) {
  const occupants = await db.all(`SELECT r.daemon_id, h.lease_until
    FROM daemon_runtime_state r LEFT JOIN agent_identity_heads h ON h.agent_id = r.daemon_id
    WHERE r.territory_id = ?`, input.id);
  const active = occupants.find((row) => Number(row.lease_until) > Date.now());
  if (active) throw new Error(`Territoire ${input.id} occupé par ${active.daemon_id} jusqu'à ${new Date(active.lease_until).toISOString()}`);
  await withTransaction(db, async () => {
    await db.run('DELETE FROM daemon_runtime_state WHERE territory_id = ?', input.id);
    await db.run(`UPDATE daemon_territories SET repo_identity = ?, root_path = ?, scope_path = ?,
      ref = ?, head_sha = ?, state = 'BOOTSTRAPPING', metadata_json = ?,
      indexed_head_sha = NULL, last_indexed_at = NULL, last_observed_at = datetime('now') WHERE id = ?`,
    input.repoIdentity, input.rootPath, input.scopePath, input.ref,
    input.headSha, JSON.stringify(input.metadata), input.id);
  });
  return territoryService.getTerritory(db, { id: input.id });
}

async function main() {
  const [repoC, repoD] = process.argv.slice(2);
  if (!repoC || !repoD) {
    process.stderr.write('Usage: node setup-daemon-databases.cjs <cheminRepoC> <cheminRepoD>\n');
    process.exit(2);
  }

  const dbPath = deployment.sharedDatabasePath();
  const repoPaths = { C: repoC, D: repoD };
  const db = await getDatabase(dbPath);
  try {
    for (const daemon of deployment.DAEMONS) {
      await setupTerritory(db, { territoryId: daemon.territoryId, repoPath: repoPaths[daemon.drive], driveLabel: `${daemon.drive}:` });
    }
  } finally {
    await closeDatabase();
  }

  console.log('\n=== Installation terminée ===');
  console.log(`  Base partagée : ${dbPath}`);
}

main().catch((err) => {
  process.stderr.write(`Erreur : ${err.message}\n`);
  process.exit(1);
});
