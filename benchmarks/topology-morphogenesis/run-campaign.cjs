'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repo = path.resolve(__dirname, '../..');
const runId = `campaign-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const output = path.join(repo, 'artifacts', 'topology-morphogenesis', runId);
const fixture = path.join(output, 'workspace');
const missions = [
  'orchestrateur-simple', 'topologie-trinity', 'topologie-a-team',
  'topologie-biome', 'topologie-biocenose', 'topologie-holobionte',
  'topologie-syncytium', 'topologie-rhizome', 'topologie-metapopulation',
  'morphogenese-plan', 'morphogenese-shadow', 'garde-preuve-negative'
];

function environment(name) {
  return {
    ...process.env,
    GENOS_WORKSPACE_ROOT: fixture,
    GENOS_CAPSULE_ROOT: path.join(repo, '.genos-agent-worlds', runId),
    GENOS_RUNNER_LOG_DIR: path.join(output, 'runner-logs'),
    GENOS_TOPOLOGY_AWAIT_WORKERS: '1',
    GENOS_AGENT_EXECUTOR: process.env.GENOS_AGENT_EXECUTOR || 'local',
    GENOS_WORKTREE_GC_DELAY_MS: '5000',
    GENOS_MORPHOGENESIS_V2_SHADOW: name === 'morphogenese-shadow' ? '1' : '0'
  };
}

function execute(name) {
  const missionPath = path.join(__dirname, 'missions', `${name}.json`);
  const payload = fs.readFileSync(missionPath, 'utf8');
  const log = fs.openSync(path.join(output, `${name}.log`), 'w');
  const started = Date.now();
  return new Promise((resolve) => {
    let timedOut = false;
    const child = spawn(process.execPath, ['backend/bin/genos-orchestrate.cjs', payload], {
      cwd: repo, env: environment(name), stdio: ['ignore', log, log], windowsHide: true
    });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 240000);
    child.once('error', (error) => resolve({ name, error: error.message, durationMs: Date.now() - started }));
    child.once('close', (exitCode) => {
      clearTimeout(timer);
      fs.closeSync(log);
      resolve({ name, exitCode, timedOut, durationMs: Date.now() - started });
    });
  });
}

function readReceipt(name) {
  const log = fs.readFileSync(path.join(output, `${name}.log`), 'utf8');
  const lines = log.trim().split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index--) {
    try { return JSON.parse(lines[index]); } catch (_) { /* diagnostic line */ }
  }
  return null;
}

async function workerStates(db, receipt) {
  if (!receipt?.orchestratorId) return [];
  const rows = await db.all(
    "SELECT id, status FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' ORDER BY id",
    receipt.orchestratorId
  );
  return rows.map((row) => ({ id: row.id, status: row.status }));
}

function runSessionProbes() {
  const log = fs.openSync(path.join(output, 'session-probes.log'), 'w');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'session-probes.cjs'), output], {
      cwd: repo, env: process.env, stdio: ['ignore', log, log], windowsHide: true
    });
    child.once('error', (error) => resolve({ error: error.message }));
    child.once('close', (exitCode) => { fs.closeSync(log); resolve({ exitCode }); });
  });
}

async function main() {
  fs.mkdirSync(fixture, { recursive: true });
  fs.mkdirSync(path.join(output, 'runner-logs'), { recursive: true });
  fs.writeFileSync(path.join(fixture, 'README.md'), 'Isolated campaign workspace.\n');
  process.loadEnvFile(path.join(repo, '.env'));
  const { getDatabase, closeDatabase } = require('../../backend/src/db');
  const db = await getDatabase();
  const results = { suiteVersion: '1.0.0', runId, gitCommit: null, missions: [] };
  try {
    const git = require('child_process').execFileSync;
    results.gitCommit = git('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    for (const name of missions) {
      const run = await execute(name);
      const receipt = readReceipt(name);
      const workers = await workerStates(db, receipt);
      results.missions.push({ ...run, orchestratorId: receipt?.orchestratorId || null,
        verdict: receipt?.verdict || null, completionGate: receipt?.completionGate || null,
        dispatchStatus: receipt?.biologicalMode?.status || receipt?.trinity?.status || receipt?.team?.status || null,
        sessionId: receipt?.biologicalMode?.sessionId || null, workers });
      fs.writeFileSync(path.join(output, 'campaign-results.json'), JSON.stringify(results, null, 2));
      process.stdout.write(`${name}: exit=${run.exitCode ?? 'error'} workers=${workers.length}\n`);
    }
  } finally { await closeDatabase(); }
  const probes = await runSessionProbes();
  process.stdout.write(`session-probes: exit=${probes.exitCode ?? 'error'}\n`);
  process.stdout.write(`${output}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
