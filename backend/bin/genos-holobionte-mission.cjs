'use strict';

const path = require('path');
const { resolveContainedPathNoSymlinkSync } = require('../src/services/pathSafety');
const { getDatabase } = require('../src/db');
const capabilityMission = require('../src/services/holobionte/runtime/holobiontMissionService');
const variantMission = require('../src/services/holobionte/variants/variantMissionExecutor');

function adapterFrom(relativePath) {
  const file = resolveContainedPathNoSymlinkSync(process.cwd(), relativePath, 'adapter');
  const adapter = require(file);
  if (!adapter || typeof adapter.createMissionInput !== 'function') throw new Error('The adapter must export createMissionInput().');
  return adapter;
}

function capabilitySummary(result) {
  return { schema: result.schema, missionId: result.missionId, holobiontId: result.holobiontId,
    hostId: result.hostId, status: result.status, stopped: result.stopped,
    persistentHost: result.persistentHost, hostReused: result.hostReused,
    usage: result.usage, budget: result.budget, lifecycle: result.lifecycle,
    capabilities: result.completed.map((item) => ({ capability: item.capability, status: item.status,
      result: item.execution?.result, resultHash: item.execution?.contribution?.resultHash,
      evidenceRefs: item.execution?.contribution?.evidenceRefs })) };
}

function publicSummary(result) {
  if (result.completed) return capabilitySummary(result);
  return { schema: result.schema, runId: result.runId, missionId: result.missionId,
    hostId: result.hostId, persistentHost: result.persistentHost, hostReused: result.hostReused,
    topology: result.topology, verdict: result.verdict, reason: result.reason || null,
    verifierIds: result.verifierIds, assertions: result.assertions,
    usage: result.usage, budget: result.budget, evidenceRefs: result.evidenceRefs,
    operations: result.workflow?.completed?.map((item) => ({ operation: item.operation,
      evaluationId: item.evaluationId || null, resultHash: item.resultHash || null })) || [] };
}

function missionPassed(result, variants) {
  return variants ? result.verdict === 'PASS' : result.status === 'VERIFIED' && result.stopped;
}

async function main() {
  const adapterPath = process.argv[2];
  if (!adapterPath || path.isAbsolute(adapterPath)) throw new Error('Usage: node backend/bin/genos-holobionte-mission.cjs <workspace-relative-adapter.cjs>');
  const adapter = adapterFrom(adapterPath);
  const args = process.argv.slice(3);
  const preflightOnly = args.includes('--preflight');
  const input = await adapter.createMissionInput({ argv: args.filter((arg) => arg !== '--preflight') });
  const variants = Array.isArray(input.variantOperations);
  const report = variants ? variantMission.preflightVariantMission(input) : capabilityMission.preflightHolobiontMission(input);
  if (preflightOnly) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ready) process.exitCode = 2;
    return;
  }
  if (!report.ready) throw Object.assign(new Error(report.blockers.join(' ')), { code: 'HOLOBIONT_PREFLIGHT_BLOCKED' });
  const db = await getDatabase();
  const result = variants ? await variantMission.runVariantMission(db, input) : await capabilityMission.runHolobiontMission(db, input);
  process.stdout.write(`${JSON.stringify(publicSummary(result), null, 2)}\n`);
  const passed = missionPassed(result, variants);
  if (!passed) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'BLOCKED', code: error.code || 'HOLOBIONT_MISSION_FAILED', message: error.message })}\n`);
  process.exitCode = 1;
});
