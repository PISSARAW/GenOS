#!/usr/bin/env node
'use strict';

/**
 * Lance deux daemons résidents (un sur C:, un sur D:) en arrière-plan détaché.
 * Usage : node backend/scripts/start-daemons.cjs <cheminRepoC> <cheminRepoD>
 * Les processus sont détournés (détachés) pour survivre à la fin du script.
 */

const { spawn } = require('child_process');
const path = require('path');

const [repoC, repoD] = process.argv.slice(2);
if (!repoC || !repoD) {
  process.stderr.write('Usage: node start-daemons.cjs <cheminRepoC> <cheminRepoD>\n');
  process.exit(2);
}

const daemonBin = path.resolve('backend/bin/genos-daemon.cjs');

function launch({ drive, territoryId, daemonId, repoPath }) {
  const child = spawn(process.execPath, [daemonBin, '--territory', territoryId, '--daemon-id', daemonId], {
    cwd: process.cwd(),
    windowsHide: true,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });
  child.unref();
  console.log(`[start-daemons] daemon ${daemonId} lancé (PID ${child.pid}) sur ${territoryId} (${drive}: ${repoPath})`);
}

launch({ drive: 'C', territoryId: 'territory.github-c', daemonId: 'daemon-github-c', repoPath: repoC });
launch({ drive: 'D', territoryId: 'territory.github-d', daemonId: 'daemon-github-d', repoPath: repoD });

console.log('[start-daemons] Les deux daemons tournent en arrière-plan. Vérification : node backend/scripts/check-daemons.cjs');
