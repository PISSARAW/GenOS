'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
try { process.loadEnvFile(path.resolve(__dirname, '../../.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const databases = require('../src/db');
const protocols = require('./helpers/automaticMorphProtocolAudit.cjs');

async function qualify(db, input) {
  const run = await require('../src/services/aTeam/teamRunStore').load(db, input.teamRunId);
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.adaptiveMorphogenesis.version, 2);
  assert.equal(run.adaptiveMorphogenesis.mode, 'automatic');
  const morph = await require('../src/services/aTeam/adaptation/liveMorphogenesisReceipt').verify(db, run);
  assert.equal(run.execution.integration.completion.success, true);
  const transition = run.execution.liveMorphogenesis.receipt;
  const change = transition.plan.aTeamPendingReplacement;
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM strategy_execution_runs WHERE agent_id=?', change.priorWorkerId)).n, 0);
  const workers = [];
  for (const member of run.members) {
    const execution = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', member.workerId);
    assert.equal(execution.status, 'completed');
    const quality = await require('../src/services/qualityElevation/qualityReceiptStore').get(db,
      { runId: execution.id, contractDigest: member.qualityElevation.digest });
    assert.equal(quality.receipt.qualityAccepted, true);
    workers.push({ workerId: member.workerId, workerKind: member.workerKind, role: member.role,
      runId: execution.id, createdAt: execution.created_at, completedAt: execution.completed_at,
      metrics: JSON.parse(execution.metrics_json), quality,
      protocols: await protocols.audit(db, execution.id) });
  }
  const delivery = run.execution.delivery;
  const final = run.execution.integration.finalQuality.artifact;
  assert.equal(require('../src/services/qualityElevation/qualityReceiptIntegrity').authenticated(final), true);
  assert.equal(final.qualityReceiptId, workers.at(-1).quality.receipt.receiptId);
  assert.equal(final.artifactDigest, workers.at(-1).quality.receipt.artifactDigest);
  assert.equal(delivery.sha256, final.artifactDigest);
  assert.equal(delivery.teamRunId, run.teamRunId);
  assert.equal(delivery.path, path.resolve(run.finalArtifactOutput.workspaceRoot, run.finalArtifactOutput.path));
  const bytes = fs.readFileSync(delivery.path);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), delivery.sha256);
  const utc = value => Date.parse(/Z$/.test(value) ? value : value.replace(' ', 'T') + 'Z');
  assert.ok(utc(workers[0].completedAt) <= utc(transition.committedAt));
  assert.ok(utc(transition.committedAt) <= utc(workers[1].createdAt));
  if (run.execution.runnerLease) delete run.execution.runnerLease.token;
  const graph = await require('../src/services/aTeam/workGraph/workGraphStore').load(db, run.workGraphId);
  await missingProtocolProbe(db, workers[0].runId);
  const result = { schema: 'genos.automatic-morphogenesis-qualification/v1', teamRunId: run.teamRunId,
    missionId: run.execution.runtimeMissionId, completion: run.execution.integration.completion,
    MORPH: { ...morph, receipt: transition }, workers, graph, delivery,
    protocolNames: ['EVIDENCE', 'CONTINUITY', 'MORPH', 'OMEGA', 'GQWF', 'SYNAPSE', 'ALLOSTASIS'],
    missingGqwfProbe: 'refused_without_mutating_the_operational_database', verifiedAt: new Date().toISOString() };
  fs.mkdirSync(input.output, { recursive: true });
  fs.writeFileSync(path.join(input.output, 'execution-proof.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(input.output, 'team-final.json'), JSON.stringify(run, null, 2));
  return { teamRunId: run.teamRunId, transitionId: transition.transitionId, protocolsVerified: 7,
    workerKinds: workers.map(w => w.workerKind), path: delivery.path, sha256: delivery.sha256 };
}

async function missingProtocolProbe(db, runId) {
  const masked = Object.create(db);
  masked.get = async (sql, ...params) => sql.includes('FROM gqwf_execution_sessions') ? undefined : db.get(sql, ...params);
  await assert.rejects(protocols.audit(masked, runId), /A real GQWF execution session must exist/);
}

async function main() {
  const [teamRunId, output] = process.argv.slice(2);
  if (!teamRunId || !output || !path.isAbsolute(output)) throw Error('Expected teamRunId and an absolute evidence output folder.');
  const db = await databases.getDatabase();
  try { console.log(JSON.stringify(await qualify(db, { teamRunId, output }), null, 2)); }
  finally { await databases.closeDatabase(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { qualify };
