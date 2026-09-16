'use strict';

/**
 * File-locked persistence for the daemon repo-state (daemon_repo_state.json).
 * Extracted from daemonRepoWorkerService.js to keep that module under the
 * 400-line limit while preserving atomic save + mutual-exclusion load/save.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '../../..');
const stateFile = path.join(repoRoot, '.genos', 'daemon_repo_state.json');
const lockFile = stateFile + '.lock';

function acquireLock() {
  try { fs.writeFileSync(lockFile, process.pid.toString(), { flag: 'wx' }); return true; } catch { return false; }
}
function releaseLock() { try { fs.unlinkSync(lockFile); } catch {} }

function loadState() {
  if (!acquireLock()) return {};
  try { return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {}; }
  catch { return {}; }
  finally { releaseLock(); }
}

function saveState(state) {
  if (!acquireLock()) return;
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const tmpFile = stateFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, stateFile);
  } finally { releaseLock(); }
}

module.exports = { loadState, saveState };
