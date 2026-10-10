'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const tests = ['test_gvx_experimental_nursery.js', 'test_gvx_paired_replay_bridge.js',
  'test_gvx_candidate_dataset.js', 'test_gvx_candidate_metric_binding.js'];
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-p1-v3-'));
const env = { ...process.env, GENOS_DISABLE_DOTENV: '1', GENOS_DB_BACKUP_SKIP: '1',
  GENOS_DB_PATH: path.join(directory, 'fallback.db'), GENOS_STUDIO_ROOT: path.join(directory, 'studio'),
  GENOS_CAPSULE_ROOT: path.join(directory, 'capsules'), GENOS_AGOW_MODE: 'off' };
try {
  for (const test of tests) {
    const result = spawnSync(process.execPath, [path.join(__dirname, test)], { windowsHide: true, env, stdio: 'inherit' });
    if (result.status !== 0) { process.exitCode = result.status || 1; break; }
  }
} finally { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 4 }); }
