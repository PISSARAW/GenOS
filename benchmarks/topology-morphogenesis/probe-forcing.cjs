'use strict';

// Sonde: le forcage d'une topologie aboutit-il au dispatch de workers ?
// Usage: node benchmarks/topology-morphogenesis/probe-forcing.cjs <taskId> <topology> <outDir> <waitMs>

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function verdictOf(dbFile) {
  const Database = require('better-sqlite3');
  const db = new Database(dbFile, { readonly: true });
  const rows = db.prepare('SELECT event_type FROM telemetry_events').all();
  db.close();
  const types = new Set(rows.map((r) => r.event_type));
  if (types.has('AUTONOMOUS_WORKER_CREATED') || types.has('WORKER_DISPATCH_RECONCILED')) return 'dispatched';
  for (const type of types) {
    if (/BLOCKED|NOT_ACTIVATED|FAILED/.test(type)) return `blocked:${type}`;
  }
  return 'undecided';
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function main() {
  const [taskId, topology, outDir, waitMs] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn(process.execPath, [path.join(__dirname, 'run-single-regime-attempt.cjs'), taskId, topology, outDir],
    { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, GENOS_ADMIN_PASSWORD: 'genos-probe-pw' } });
  child.stdout.resume();
  child.stderr.resume();
  await sleep(Number(waitMs));
  let verdict = 'no-db';
  try {
    verdict = verdictOf(path.join(outDir, 'mission.db'));
  } catch (error) {
    verdict = `db-error:${error.message.slice(0, 80)}`;
  }
  child.kill('SIGKILL');
  process.stdout.write(`${topology} ${verdict}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
