'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const seal = require('../src/services/trinityOracleSeal');
const runtime = require('../src/services/trinityVariantRuntime');

function worlds() {
  return [1, 2, 3].map((number) => ({ worldNumber: number, agentId: `agent-${number}`,
    report: { outcome: 'success', evidence: [], claims: [], tests: [] } }));
}

function event(id, agentId, report) {
  return { id, agent_id: agentId, payload_json: JSON.stringify({ evidenceReport: report }) };
}

function database(rows) {
  return { async all() { return rows; } };
}

test('Oracle prediction is accepted only from world one before peer results', async () => {
  const reports = worlds();
  reports[0].report.oraclePrediction = { world_1: 0.2, world_2: 0.3, world_3: 0.5 };
  const rows = reports.map((world, index) => event(index + 1, world.agentId, world.report));
  const receipt = await seal.capture(database(rows), 'mission-1', reports);
  assert.equal(receipt.status, 'sealed');
  assert.equal(receipt.predictionEventId, 1);
  assert.equal(runtime.runOracle(reports, receipt).status, 'executed');
});

test('Oracle refuses a prediction added after peer outcomes', async () => {
  const reports = worlds();
  reports[0].report.oraclePrediction = { world_1: 0.2, world_2: 0.3, world_3: 0.5 };
  const rows = [event(1, 'agent-2', reports[1].report), event(2, 'agent-3', reports[2].report),
    event(3, 'agent-1', reports[0].report)];
  const receipt = await seal.capture(database(rows), 'mission-1', reports);
  assert.equal(receipt, null);
  assert.equal(runtime.runOracle(reports, receipt).status, 'incomplete');
});

test('Oracle refuses a prediction from a different world or changed after sealing', async () => {
  const reports = worlds();
  reports[2].report.oraclePrediction = { world_1: 0.2, world_2: 0.3, world_3: 0.5 };
  const foreign = await seal.capture(database(reports.map((world, index) =>
    event(index + 1, world.agentId, world.report))), 'mission-1', reports);
  assert.equal(foreign, null);
  assert.equal(runtime.runOracle(reports, foreign).status, 'incomplete');
  reports[0].report.oraclePrediction = reports[2].report.oraclePrediction;
  const receipt = await seal.capture(database(reports.map((world, index) =>
    event(index + 1, world.agentId, world.report))), 'mission-1', reports);
  reports[0].report.oraclePrediction = { world_1: 0.5, world_2: 0.3, world_3: 0.2 };
  assert.equal(runtime.runOracle(reports, receipt).status, 'incomplete');
});
