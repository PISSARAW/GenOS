#!/usr/bin/env node
'use strict';

/**
 * Installe les deux territoires daemon dans leurs bases SQLite dédiées.
 * Usage : node backend/scripts/setup-daemon-databases.cjs <cheminRepoC> <cheminRepoD>
 */

const { execFileSync } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const { createTerritory } = require('../src/services/daemon/daemonTerritoryService');

const ID_C = 'territory.github-c';
const ID_D = 'territory.github-d';

function gitHeadSha(repoPath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  } catch (_) {
    return null;
  }
}

async function setupTerritory({ dbPath, territoryId, repoPath, driveLabel }) {
  process.env.GENOS_DB_PATH = dbPath;
  const headSha = gitHeadSha(repoPath);
  if (!headSha) {
    throw new Error(`Impossible de lire le HEAD git pour ${driveLabel}: ${repoPath}`);
  }
  const db = await getDatabase();
  const t = await createTerritory(db, {
    id: territoryId,
    organizationId: 'org-local',
    projectId: 'github-local',
    workspaceId: 'ws-pc',
    repoIdentity: `file://${repoPath.replace(/\\/g, '/')}`,
    rootPath: repoPath,
    scopePath: '/',
    ref: 'main',
    headSha,
    state: 'ACTIVE',
    metadata: { source: 'local-pc', drive: driveLabel }
  });
  console.log(`[${driveLabel}] Territoire ${territoryId} prêt (HEAD ${headSha.slice(0, 12)}...)`);
  await closeDatabase();
  delete process.env.GENOS_DB_PATH;
  return t;
}

async function main() {
  const [repoC, repoD] = process.argv.slice(2);
  if (!repoC || !repoD) {
    process.stderr.write('Usage: node setup-daemon-databases.cjs <cheminRepoC> <cheminRepoD>\n');
    process.exit(2);
  }

  await setupTerritory({ dbPath: 'backend\\data\\genos-C.db', territoryId: ID_C, repoPath: repoC, driveLabel: 'C:' });
  await setupTerritory({ dbPath: 'backend\\data\\genos-D.db', territoryId: ID_D, repoPath: repoD, driveLabel: 'D:' });

  console.log('\n=== Installation terminée ===');
  console.log('  C:  -> backend\\data\\genos-C.db (territory.github-c)');
  console.log('  D:  -> backend\\data\\genos-D.db (territory.github-d)');
}

main().catch((err) => {
  process.stderr.write(`Erreur : ${err.message}\n`);
  process.exit(1);
});
