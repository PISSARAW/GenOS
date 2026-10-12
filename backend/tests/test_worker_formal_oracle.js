'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const formalWorker = require('../src/services/agents/deterministicWorkerFormal');
const oracle = require('../src/services/epistemic/oracleFormalChecks');

function resolveLean() {
  const configured = process.env.GENOS_LEAN_EXECUTABLE;
  if (configured) return configured;
  const resolver = process.platform === 'win32' ? 'where.exe' : 'which';
  const found = spawnSync(resolver, ['lean'], { encoding: 'utf8', windowsHide: true });
  return found.status === 0 ? found.stdout.trim().split(/\r?\n/u)[0] : '';
}

async function main() {
  const leanExecutable = resolveLean();
  if (!leanExecutable) { console.log('Formal native oracle skipped: Lean is unavailable.'); return; }
  const toolchainVersion = execFileSync(leanExecutable, ['--version'], { encoding: 'utf8' }).trim();
  const method = { version: 1, methodId: 'formal_proof', parameters: { claim: '2 + 2 = 4', toolchainVersion } };
  const result = await formalWorker.runFormal(method, { leanExecutable });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-formal-oracle-'));
  const previous = process.cwd();
  try {
    process.chdir(directory);
    const subject = { method, result, leanExecutable };
    for (const strategy of oracle.STRATEGIES) assert.equal(oracle.checkFormal(subject, strategy).status, 'verified');
    const forged = { ...result, solverReceipt: { ...result.solverReceipt, result: 'unproved' } };
    assert.equal(oracle.checkFormal({ ...subject, result: forged }, 'formal_lean_receipt').status, 'refuted');
  } finally {
    process.chdir(previous);
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log(`Lean ${toolchainVersion}: two independent native oracle processes verified the sealed claim.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
