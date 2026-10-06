#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { getDatabase, closeDatabase } = require('../src/db');
const { adapter } = require('../src/services/shev/actionProvider');
const responsibility = require('../src/services/shev/responsibilityService');
const recovery = require('../src/services/shev/recoveryService');
const development = require('../src/services/shev/developmentJobService');

async function status(db, projectId) {
  const responsibilityView = await responsibility.getResponsibility(db, projectId);
  if (!responsibilityView) throw new Error('SHEV responsibility does not exist.');
  const sensors = await db.all('SELECT * FROM shev_sensors WHERE project_id = ?', [projectId]);
  const jobs = await db.all(`SELECT * FROM shev_runtime_jobs WHERE project_id = ? ORDER BY started_at DESC LIMIT 30`, [projectId]);
  const initiatives = await db.all(`SELECT i.*, e.project_result FROM shev_initiatives i
    LEFT JOIN shev_effects e ON e.initiative_id = i.id WHERE i.project_id = ? ORDER BY i.created_at DESC LIMIT 30`, [projectId]);
  const progress = await db.all(`SELECT p.* FROM shev_agent_progress p JOIN shev_initiatives i ON i.id = p.initiative_id
    WHERE i.project_id = ? ORDER BY p.created_at DESC LIMIT 30`, [projectId]);
  return { responsibility: responsibilityView, sensors, jobs, initiatives, agentProgress: progress };
}

function commands() {
  return {
    register: responsibility.registerResponsibility,
    revise: responsibility.reviseResponsibility,
    'enroll-sensor': require('../src/services/shev/sensorService').enrollSensor,
    observe: require('../src/services/shev/observationService').recordObservation,
    'approve-initiative': require('../src/services/shev/initiativeService').approveInitiative,
    'decline-initiative': require('../src/services/shev/initiativeService').declineInitiative,
    'propose-recovery': recovery.proposeRecovery,
    'approve-recovery': recovery.approveRecovery,
    'approve-development': development.approveDevelopment,
    'register-protocol': require('../src/services/shev/longitudinalProtocolService').registerProtocol,
    judge: require('../src/services/shev/qualitativeService').recordQualitativeJudgment,
    disagreement: require('../src/services/shev/qualitativeService').qualitativeDisagreement
  };
}

async function runCommand(db, command, input) {
  const simple = commands()[command];
  if (simple) return simple(db, input);
  if (command === 'status') return status(db, input.projectId);
  if (command === 'tick') return require('../src/services/ontogenesis/tickService').tickOnce(db,
    { projectId: input.projectId, owner: `shev-cli:${process.pid}`,
      harness: require('../src/services/ontogenesis/runtimeHarness').createRuntimeHarness() });
  if (command === 'reconcile-recovery') return recovery.reconcileRecovery(db,
    { ...input, verify: adapter('verifyRecoveryReconciliation') });
  if (command === 'reconcile-development') return development.reconcileDevelopment(db, input);
  if (command === 'calibrate') return require('../src/services/shev/qualitativeService').calibrateEvaluator(db,
    { ...input, verifyReferences: adapter('verifyQualitativeReferences') });
  if (command === 'compare') return require('../src/services/shev/longitudinalService').recordLongitudinalComparison(db,
    { ...input, verifyReferences: adapter('verifyLongitudinalReferences') });
  throw new Error(`Unknown SHEV command: ${command}`);
}

async function main(argv) {
  const command = argv[0];
  if (!command || command === '--help') {
    console.log('Usage: genos-shev.cjs <command> --input FILE.json');
    console.log('Commands: register, revise, enroll-sensor, observe, approve-initiative, decline-initiative, propose-recovery, approve-recovery,');
    console.log('  reconcile-recovery, approve-development, reconcile-development, register-protocol, calibrate, judge, disagreement, compare, status, tick');
    return;
  }
  const index = argv.indexOf('--input');
  if (index < 0 || !argv[index + 1]) throw new Error('--input FILE.json is required.');
  const bytes = fs.readFileSync(argv[index + 1]);
  if (bytes.length > 1048576) throw new Error('SHEV input exceeds 1 MiB.');
  const input = JSON.parse(bytes.toString('utf8'));
  const db = await getDatabase();
  try { console.log(JSON.stringify(await runCommand(db, command, input), null, 2)); }
  finally { await closeDatabase(); }
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { runCommand, status };
