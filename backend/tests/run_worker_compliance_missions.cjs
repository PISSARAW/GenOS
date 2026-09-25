'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const kinds = require('../src/services/agents/workerKindService');
const scenarios = require('./fixtures/workerComplianceScenarios');

const RUN_ID = process.env.GENOS_COMPLIANCE_RUN_ID || `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

function inside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateIsolation() {
  const root = process.env.GENOS_COMPLIANCE_ROOT;
  const database = process.env.GENOS_DB_PATH;
  const workspace = process.env.GENOS_WORKSPACE_ROOT;
  const capsules = process.env.GENOS_CAPSULE_ROOT;
  if (!root || !database || !workspace || !capsules) throw new Error('Set GENOS_COMPLIANCE_ROOT, GENOS_DB_PATH, GENOS_WORKSPACE_ROOT, and GENOS_CAPSULE_ROOT to isolated paths.');
  for (const target of [database, workspace, capsules]) {
    if (!inside(root, target)) throw new Error(`Compliance path escapes isolated root: ${target}`);
  }
  if (inside(process.cwd(), root) || !process.env.GENOS_ADMIN_PASSWORD) throw new Error('Use a temporary isolation root outside the repository and provide GENOS_ADMIN_PASSWORD.');
}

function launchEachKind() {
  const failed = [];
  for (const kind of Object.keys(kinds.KINDS)) {
    const result = spawnSync(process.execPath, [__filename], {
      env: { ...process.env, GENOS_COMPLIANCE_KIND: kind, GENOS_COMPLIANCE_RUN_ID: RUN_ID },
      stdio: 'inherit', windowsHide: true
    });
    if (result.status !== 0) failed.push(kind);
  }
  const reportPath = path.join(process.env.GENOS_COMPLIANCE_ROOT, 'worker-compliance-report.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const results = report.results.filter((entry) => entry.runId === RUN_ID);
  process.stdout.write(`Compliance run ${RUN_ID}: ${results.filter((entry) => entry.passed).length}/${results.length} passed. Failed process kinds: ${failed.join(', ') || 'none'}.\n`);
  process.exitCode = results.length === 19 && results.every((entry) => entry.passed) ? 0 : 1;
}

function runSelectedKind() {
  return require('./run_worker_compliance_mission.cjs').runOne({ runId: RUN_ID, kind: process.env.GENOS_COMPLIANCE_KIND });
}

validateIsolation();
if (process.env.GENOS_COMPLIANCE_KIND) runSelectedKind().catch((error) => { console.error(error.stack || error); process.exitCode = 2; });
else launchEachKind();
