'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { openDatabase } = require('./helpers/biologyDatabase');
const authority = require('../src/services/homeostasisAuthorityStore');
const homeostasis = require('../src/services/homeostasisService');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-homeostasis-wal-'));
const filename = path.join(temp, 'authority.sqlite');
const helper = path.join(__dirname, 'helpers/homeostasisAuthorityProcess.cjs');

function runChild(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [helper, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(stdout))
      : reject(new Error(`child exited ${code}: ${stderr}`)));
  });
}

async function waitForFiles(files) {
  const deadline = Date.now() + 30000;
  while (files.some(file => !fs.existsSync(file))) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for process readiness');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function startContender(input) {
  return runChild(['resolve', filename, input.missionId, '1', input.flag,
    input.readyFile, input.goFile]);
}

async function simultaneousRevisionConflict() {
  const db = openDatabase(filename);
  try {
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec(`CREATE TABLE schema_migrations (version TEXT PRIMARY KEY, description TEXT);
      CREATE TABLE homeostasis_states (id TEXT PRIMARY KEY, contract_id TEXT, mission_id TEXT,
        status TEXT, state_json TEXT, observed_at TEXT);
      CREATE TABLE missions (mission_id TEXT PRIMARY KEY, objective TEXT, status TEXT,
        orchestrator_agent_id TEXT, created_at TEXT, updated_at TEXT);`);
    await authority.resolve(db, { missionId: 'race-mission', explicit: true, expectedRevision: 0,
      proposed: () => require('../src/services/homeostasisContractService').buildHomeostasisContract({
        id: 'race-contract', missionId: 'race-mission', invariants: [
          { id: 'initial', kind: 'functional', verifier: { type: 'context.flag', flag: 'initial' } }
        ]
      }) });
  } finally { await db.close(); }
  const ready = ['a.ready', 'b.ready'].map(name => path.join(temp, name));
  const goFile = path.join(temp, 'go');
  const attempts = [startContender({ missionId: 'race-mission', flag: 'candidate_a',
    readyFile: ready[0], goFile }), startContender({ missionId: 'race-mission', flag: 'candidate_b',
    readyFile: ready[1], goFile })];
  await waitForFiles(ready);
  fs.writeFileSync(goFile, 'go');
  const results = await Promise.all(attempts);
  assert.equal(results.filter(item => item.status === 'saved').length, 1);
  assert.deepEqual(results.filter(item => item.status === 'rejected').map(item => item.code),
    ['HOMEOSTASIS_REVISION_CONFLICT']);
}

async function createStaleClosure() {
  const db = openDatabase(filename);
  try {
    const transition = await homeostasis.transitionMissionToComplete(db, {
      mission: { id: 'closure-mission', completionContract: { invariants: [
        { id: 'passed', kind: 'functional', verifier: { type: 'context.flag', flag: 'passed' } }
      ] } }, context: { flags: { passed: true } }
    });
    assert.equal(transition.allowed, true);
    assert.equal(transition.receipt.contractRevision, 1);
    await require('../src/services/homeostasisClosureService').assertClosure(db, 'closure-mission');
  } finally { await db.close(); }
}

async function restartAndRejectStaleClosure() {
  const changed = await runChild(['update', filename, 'closure-mission', '1', 'revised']);
  assert.deepEqual(changed, { status: 'saved', revision: 2 });
  const replayed = await runChild(['inspect', filename, 'closure-mission', '1', '', '-', '-']);
  assert.equal(replayed.revision, 2, 'a new process reloads the durable active authority');
  assert.equal(replayed.staleClosure.code, 'HOMEOSTASIS_COMPLETION_RECEIPT_REQUIRED',
    'a receipt from the prior authority cannot authorize closure after restart');
}

async function main() {
  const telemetry = require('../src/services/telemetryObserver');
  const persistAsync = telemetry.persistAsync;
  telemetry.persistAsync = () => {};
  try {
    await simultaneousRevisionConflict();
    await createStaleClosure();
    await restartAndRejectStaleClosure();
    console.log('Two-process SQLite WAL authority conflict, restart replay and stale closure rejection passed.');
  } finally {
    telemetry.persistAsync = persistAsync;
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
