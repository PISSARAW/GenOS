'use strict';

const assert = require('node:assert/strict');
const { createRealAdapter } = require('../../benchmarks/ateam/realAdapter.cjs');
const { summarizeArms, pairedDeltas } = require('../../benchmarks/ateam/benchmarkRunner.cjs');

function soloSpawn(stdout) {
  return async () => ({ stdout, stderr: '', exitCode: 0, elapsedMs: 120 });
}

function soloStdout(telemetry) {
  return JSON.stringify({ orchestratorId: 'orch_1', success: true, verdict: 'completed', telemetry, token_usage: { totalTokens: 321 } });
}

function teamSpawn() {
  return async () => ({ stdout: JSON.stringify({ orchestratorId: 'orch_2', aTeam: { status: 'accepted' } }), stderr: '', exitCode: 0, elapsedMs: 5 });
}

function teamDb() {
  return {
    async all(sql) {
      if (String(sql).includes('telemetry_events')) return [{ event_type: 'EVIDENCE_REPORT' }];
      if (String(sql).includes('strategy_execution_runs')) return [{ metrics_json: '{"tokens":100}' }, { metrics_json: '{"tokens":50}' }];
      return [{ status: 'completed' }];
    },
    async get() { return { status: 'completed' }; },
    async close() {}
  };
}

function adapterWith(overrides = {}) {
  return createRealAdapter({ rootDir: '/tmp/genos-test', openDb: async () => teamDb(), ...overrides });
}

async function run() {
  const scenario = { scenarioId: 'api-release', mission: 'Ship it.', verifierId: 'smoke-tests', budget: { tokens: 100, timeoutMs: 1000 } };

  const ok = await adapterWith({ spawnMission: soloSpawn(soloStdout([{ event_type: 'EVIDENCE_REPORT' }])) })
    .executeCase({ scenario, arm: { id: 'solo' }, repetition: 0, seed: 's:0' });
  assert.equal(ok.succeeded, true);
  assert.equal(ok.evidenceValid, true);
  assert.equal(ok.tokenCost, 321);
  assert.equal(ok.elapsedMs, 120);

  const noEvidence = await adapterWith({ spawnMission: soloSpawn(soloStdout([{ event_type: 'AGENT_STARTED' }])) })
    .executeCase({ scenario, arm: { id: 'solo' }, repetition: 0, seed: 's:0' });
  assert.equal(noEvidence.succeeded, true);
  assert.equal(noEvidence.evidenceValid, false);

  const garbage = await adapterWith({ spawnMission: soloSpawn('not json') })
    .executeCase({ scenario, arm: { id: 'solo' }, repetition: 0, seed: 's:0' });
  assert.deepEqual(garbage, { succeeded: false, evidenceValid: false, elapsedMs: 120, tokenCost: 0 });

  const team = await adapterWith({ spawnMission: teamSpawn() })
    .executeCase({ scenario, arm: { id: 'a_team_full' }, repetition: 0, seed: 's:0' });
  assert.equal(team.succeeded, true);
  assert.equal(team.evidenceValid, true);
  assert.equal(team.tokenCost, 150);

  const refused = await adapterWith({ spawnMission: async () => ({ stdout: '{}', stderr: 'x', exitCode: 1, elapsedMs: 7 }) })
    .executeCase({ scenario, arm: { id: 'a_team_full' }, repetition: 0, seed: 's:0' });
  assert.deepEqual(refused, { succeeded: false, evidenceValid: false, elapsedMs: 7, tokenCost: 0 });

  await assert.rejects(
    adapterWith({}).executeCase({ scenario, arm: { id: 'flat_parallel' }, repetition: 0, seed: 's:0' }),
    { code: 'ATEAM_ADAPTER_ARM_UNSUPPORTED' }
  );
  await assert.rejects(
    adapterWith({}).executeCase({ scenario: { scenarioId: 'x' }, arm: { id: 'solo' }, repetition: 0, seed: 's:0' }),
    { code: 'ATEAM_ADAPTER_MISSION_REQUIRED' }
  );

  const runs = [
    { scenarioId: 'api-release', arm: 'solo', repetition: 0, succeeded: ok.succeeded, evidenceValid: ok.evidenceValid, elapsedMs: ok.elapsedMs, tokenCost: ok.tokenCost },
    { scenarioId: 'api-release', arm: 'a_team_full', repetition: 0, succeeded: team.succeeded, evidenceValid: team.evidenceValid, elapsedMs: team.elapsedMs, tokenCost: team.tokenCost }
  ];
  assert.equal(summarizeArms(runs).solo.verifiedSuccessRate, 1);
  assert.equal(pairedDeltas(runs).a_team_full.pairedSamples, 1);
  assert.equal(pairedDeltas(runs).a_team_full.verifiedSuccessDelta, 0);
}

run().then(() => console.log('A-Team real adapter maps solo and team missions to evidence-gated outcomes.'))
  .catch((error) => { console.error(error); process.exit(1); });
