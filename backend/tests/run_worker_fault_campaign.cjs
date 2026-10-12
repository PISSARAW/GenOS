'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { KINDS } = require('../src/services/agents/workerKindService');
const { runKind } = require('./run_worker_gate_campaign.cjs');

const TIMEOUT_SCRIPT = path.join(__dirname, 'fixtures/workerGateNeverCompletes.cjs');
const TIMEOUT_MS = 100;

function validate(options) {
  const kinds = options.kinds || Object.keys(KINDS);
  const distinct = new Set(kinds);
  if (!Array.isArray(kinds) || !kinds.length || distinct.size !== kinds.length
    || kinds.some((kind) => !Object.hasOwn(KINDS, kind))) {
    throw new Error('Worker fault campaign requires unique registered worker kinds.');
  }
  if (!options.output || !kinds.includes(options.tamperKind) || !kinds.includes(options.timeoutKind)
    || options.tamperKind === options.timeoutKind) {
    throw new Error('Worker fault campaign requires output and two distinct fault targets from its kinds.');
  }
  return kinds;
}

function faultFor(kind, options) {
  if (kind === options.tamperKind) return 'tampered_assembly';
  if (kind === options.timeoutKind) return 'process_timeout';
  return 'none';
}

async function tamperAssemblies(db) {
  const rows = await db.all('SELECT id FROM aeis_assurance_assemblies');
  if (!rows.length) throw new Error('The completed worker mission persisted no assurance assembly to tamper with.');
  for (const row of rows) {
    await db.run('UPDATE aeis_assurance_assemblies SET payload_json = ? WHERE id = ?',
      '{"tampered":true}', row.id);
  }
}

function optionsForFault(fault) {
  if (fault === 'tampered_assembly') return { beforeQualification: tamperAssemblies };
  if (fault === 'process_timeout') return { script: TIMEOUT_SCRIPT, timeoutMs: TIMEOUT_MS };
  return {};
}

function expectedResult(fault, item) {
  if (fault === 'tampered_assembly') {
    return item.exitCode === 0 && item.qualification.reason === 'oracle_proof_invalid';
  }
  if (fault === 'process_timeout') {
    return item.exitCode === null && item.qualification.reason === 'mission_evidence_missing';
  }
  return item.verified;
}

function save(output, report) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`);
  fs.renameSync(temporary, output);
}

async function runCampaign(options) {
  const kinds = validate(options);
  const output = path.resolve(options.output);
  const report = { schema: 'genos.worker-gate-fault-campaign/v1',
    capturedAt: new Date().toISOString(), requestedKinds: kinds,
    faultPlan: { [options.tamperKind]: 'tampered_assembly', [options.timeoutKind]: 'process_timeout' },
    results: [] };
  const seenNonces = new Set();
  for (const kind of kinds) {
    const fault = faultFor(kind, options);
    const result = await runKind(kind, seenNonces, optionsForFault(fault));
    report.results.push({ ...result, injectedFault: fault,
      conforms: expectedResult(fault, result) });
    save(output, report);
  }
  report.conforming = report.results.filter((entry) => entry.conforms).length;
  report.passed = report.conforming === report.requestedKinds.length;
  report.uniqueAcceptedNonces = seenNonces.size;
  save(output, report);
  return report;
}

function parseArgs() {
  const output = process.argv[2] && path.resolve(process.argv[2]);
  const kinds = process.argv.slice(3);
  if (!output) throw new Error('Usage: node run_worker_fault_campaign.cjs <output.json> [unique worker kinds...]');
  const requested = kinds.length ? kinds : Object.keys(KINDS);
  const defaultFaultTargets = ['verifier_worker', 'recovery_worker'];
  const faultTargets = defaultFaultTargets.filter((kind) => requested.includes(kind));
  if (faultTargets.length !== 2) {
    throw new Error('Selected worker kinds must include verifier_worker and recovery_worker for the fault probes.');
  }
  return { output, kinds: requested, tamperKind: faultTargets[0], timeoutKind: faultTargets[1] };
}

async function main() {
  const report = await runCampaign(parseArgs());
  process.stdout.write(`${JSON.stringify({ passed: report.passed,
    conforming: report.conforming, requested: report.requestedKinds.length,
    faults: report.faultPlan, uniqueAcceptedNonces: report.uniqueAcceptedNonces,
    reportPath: path.resolve(process.argv[2]) })}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });

module.exports = { runCampaign };
