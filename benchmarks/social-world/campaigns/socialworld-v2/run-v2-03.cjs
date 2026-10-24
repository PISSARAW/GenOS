'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateReport } = require('./validate-report.cjs');

function parseArgs(args) {
  const result = {};
  for (let index = 0; index < args.length; index += 2) result[args[index].replace(/^--/, '')] = args[index + 1];
  return result;
}

async function runPhase(phase, databasePath, payloadPath) {
  const { getDatabase, closeDatabase } = require('../../../../backend/src/db');
  const lineageMemory = require('../../../../backend/src/services/memory/lineageMemoryRepository');
  const db = await getDatabase(databasePath);
  try {
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    if (phase === 'write') {
      await db.run(`INSERT OR IGNORE INTO agents
        (id, name, role, status, cognitive_budget, model_tier, created_at)
        VALUES ('agent-parent', 'Parent', 'worker', 'idle', 100, 'test', CURRENT_TIMESTAMP)`);
      await db.run(`INSERT OR IGNORE INTO agents
        (id, name, role, status, cognitive_budget, model_tier, created_at)
        VALUES ('agent-child', 'Child', 'worker', 'idle', 100, 'test', CURRENT_TIMESTAMP)`);
      await db.run(`INSERT OR REPLACE INTO agent_relations
        (id, source_agent_id, target_agent_id, relation_type, shared_history, metadata_json)
        VALUES ('socialworld-v2-family', 'agent-child', 'agent-parent', 'parent', 1, ?)`,
      JSON.stringify({ sourceRef: 'event:shared-001' }));
      await lineageMemory.memorize({ ...payload, lineageId: 'socialworld-v2-lineage', ancestorId: 'agent-parent' }, db);
      return { written: true, memoryId: payload.memoryId };
    }
    const memories = await lineageMemory.recall({ lineageId: 'socialworld-v2-lineage' }, db);
    const match = memories.find((entry) => entry.memoryId === payload.memoryId);
    const relation = await db.get("SELECT * FROM agent_relations WHERE id = 'socialworld-v2-family'");
    return { recalled: Boolean(match), memory: match || null, relationRecovered: Boolean(relation), relation: relation || null };
  } finally {
    await closeDatabase();
  }
}

function runChild(phase, databasePath, payloadPath) {
  const result = spawnSync(process.execPath, [__filename, '--phase', phase, '--database', databasePath, '--payload', payloadPath], {
    encoding: 'utf8', timeout: 120000, env: { ...process.env, GENOS_DB_PATH: databasePath }
  });
  if (result.error || result.status !== 0) throw new Error(`child ${phase} failed: ${result.error?.message || result.stderr}`);
  const lines = result.stdout.trim().split(/\r?\n/);
  return JSON.parse(lines[lines.length - 1]);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function reportFor(input) {
  const { args, startedAt, durationMs, evidenceName, recovered } = input;
  return {
    campaignId: 'socialworld-v2', scenario: 'V2-03', arm: args.arm || 'genos-full',
    seed: args.seed || 'socialworld-v2-01', attempt: Number(args.attempt || 1),
    sourceCommit: args.sourceCommit, runtimeVersion: '3', model: null,
    configHash: args.configHash, status: recovered ? 'pass' : 'fail', startedAt, durationMs,
    inputs: { processBoundaries: 3, durableDatabase: true },
    observed: { factRecovered: recovered, relationRecovered: recovered, negativeControlEmpty: true },
    oracle: { recalculable: recovered }, evidenceRefs: [evidenceName], violations: [], limitations: []
  };
}

async function runCampaign(args) {
  if (!args.database || !args.report) throw new Error('Usage: node run-v2-03.cjs --database <sqlite-path> --report <report.json>');
  const startedAt = new Date().toISOString();
  const reportPath = path.resolve(args.report);
  const directory = path.dirname(reportPath);
  fs.mkdirSync(directory, { recursive: true });
  const payloadPath = path.join(directory, '.v2-03-payload.json');
  const negativeDatabase = path.join(directory, '.v2-03-negative.sqlite');
  const evidenceName = `${path.basename(reportPath, '.json')}.evidence.json`;
  const evidencePath = path.join(directory, evidenceName);
  const fact = { memoryId: 'shared-fact-001', memory: { fact: 'The bridge opens at dawn', sourceRef: 'event:shared-001' }, salience: 0.9 };
  writeJson(payloadPath, fact);
  const started = Date.now();
  runChild('write', path.resolve(args.database), payloadPath);
  const positive = runChild('recall', path.resolve(args.database), payloadPath);
  const negative = runChild('recall', negativeDatabase, payloadPath);
  const recovered = positive.recalled && positive.relationRecovered
    && JSON.stringify(positive.memory.memory) === JSON.stringify(fact.memory)
    && negative.recalled === false;
  const evidence = { processBoundaries: ['writer', 'reader', 'fresh-database-control'], database: path.resolve(args.database),
    eventId: fact.memoryId, sourceRef: fact.memory.sourceRef, positive, negative, recovered };
  writeJson(evidencePath, evidence);
  const configHash = crypto.createHash('sha256').update(JSON.stringify({ scenario: 'V2-03', fact })).digest('hex');
  const sourceCommit = args.sourceCommit || spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const report = reportFor({ args: { ...args, sourceCommit, configHash }, startedAt,
    durationMs: Date.now() - started, evidenceName, recovered });
  writeJson(reportPath, report);
  fs.rmSync(payloadPath, { force: true });
  if (validateReport(report, reportPath, path.resolve(__dirname, '../../../..')).length) throw new Error('generated V2-03 report failed validation');
  if (!recovered) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.phase) {
    process.stdout.write(`${JSON.stringify(await runPhase(args.phase, args.database, args.payload))}\n`);
    return;
  }
  await runCampaign(args);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { parseArgs, reportFor };
