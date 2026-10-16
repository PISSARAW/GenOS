'use strict';

// genos-morphogenesis-corpus.cjs
//
// Report the independently verified morphogenesis calibration corpus, or import
// externally verified outcome rows. This tool never invents gains or costs:
// it only reports what the store holds (with the per-candidate deficit to the
// 30 train / 10 validation holdout bar) or persists rows whose independent
// receipt already verifies. Without a sufficient corpus the selector keeps
// NO_CHANGE, and this report shows exactly what is missing.

const fs = require('node:fs');
const path = require('node:path');

const calibration = require('../src/services/morphogenesis/morphogenesisSelectorCalibration');
const store = require('../src/services/morphogenesis/morphogenesisVerifiedOutcomeStore');

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function usage() {
  return `Usage:
  node backend/bin/genos-morphogenesis-corpus.cjs --db <sqlite-path> [--mission <id>] [--organization <id>] [--project <id>] [--limit <n>]
  node backend/bin/genos-morphogenesis-corpus.cjs --db <sqlite-path> --import <rows.jsonl> --mission <id> [--organization <id>] [--project <id>]

Report prints { calibration, deficit } as JSON. Import appends verified rows only;
unverifiable lines are rejected without being stored.`;
}

function scopeFrom(argv) {
  const scope = { missionId: argValue(argv, '--mission') || 'corpus-report' };
  const organizationId = argValue(argv, '--organization');
  const projectId = argValue(argv, '--project');
  if (organizationId) scope.organizationId = organizationId;
  if (projectId) scope.projectId = projectId;
  const limit = Number(argValue(argv, '--limit'));
  if (Number.isSafeInteger(limit) && limit > 0) scope.limit = Math.min(limit, store.MAX_OUTCOMES);
  return scope;
}

async function openDatabase(dbPath) {
  const { getDatabase } = require('../src/db');
  return getDatabase(dbPath || undefined);
}

async function report(argv) {
  const db = await openDatabase(argValue(argv, '--db'));
  try {
    const rows = await store.loadVerifiedOutcomes(db, scopeFrom(argv));
    const compiled = calibration.compileCalibration(rows);
    const deficit = calibration.describeCorpusDeficit(rows);
    process.stdout.write(`${JSON.stringify({ calibration: compiled, deficit }, null, 2)}\n`);
  } finally {
    await require('../src/db').closeDatabase().catch(() => {});
  }
}

function readImportLines(file) {
  const resolved = path.resolve(file);
  const text = fs.readFileSync(resolved, 'utf8');
  return text.split('\n').map(line => line.trim()).filter(Boolean);
}

async function importRows(argv) {
  const file = argValue(argv, '--import');
  if (!file) throw new Error('Missing --import <rows.jsonl>.');
  const missionId = argValue(argv, '--mission');
  if (!missionId) throw new Error('Import requires --mission <id> to scope the evidence.');
  const db = await openDatabase(argValue(argv, '--db'));
  try {
    const scope = scopeFrom(argv);
    let recorded = 0;
    let rejected = 0;
    for (const line of readImportLines(file)) {
      let outcome = null;
      try {
        outcome = JSON.parse(line);
      } catch (_) {
        rejected += 1;
        continue;
      }
      if (!calibration.verifiedRow(outcome)) {
        rejected += 1;
        continue;
      }
      const result = await store.recordVerifiedOutcome(db, scope, outcome);
      if (result.recorded) recorded += 1;
    }
    process.stdout.write(`${JSON.stringify({ recorded, rejected })}\n`);
  } finally {
    await require('../src/db').closeDatabase().catch(() => {});
  }
}

async function main(argv) {
  if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (argValue(argv, '--import')) await importRows(argv);
  else await report(argv);
}

main(process.argv.slice(2)).catch(error => {
  process.stderr.write(`[genos-morphogenesis-corpus] ${error.message}\n`);
  process.exitCode = 1;
});
