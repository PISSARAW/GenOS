'use strict';

const path = require('path');
const { spawn } = require('child_process');

function launch(options = {}) {
  const script = path.resolve(options.repoRoot, 'backend/bin/trinity-supervisor.cjs');
  const payload = JSON.stringify({
    missionId: options.missionId,
    orchestratorId: options.orchestratorId,
    repoRoot: options.repoRoot,
    domain: options.domain,
    threshold: options.threshold
  });
  const child = spawn(process.execPath, [script, payload], {
    cwd: options.repoRoot,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  return { status: 'started', pid: child.pid };
}

module.exports = { launch };
