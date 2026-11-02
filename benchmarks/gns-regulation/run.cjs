#!/usr/bin/env node
'use strict';

const { performance } = require('node:perf_hooks');
const { fixture, enroll, pause } = require('../../backend/tests/nervous/regulationFixture');
const garage = require('../../backend/src/services/workerGarageService');
const regulator = require('../../backend/src/services/nervous/regulationRuntime');
const workload = require('./workload.cjs');

async function admission(h, state) {
  const idle = await h.db.get("SELECT id FROM agents WHERE execution_mode='worker' AND status='idle' ORDER BY id LIMIT 1");
  if (!idle || !state.pending.length) return;
  state.attempts += 1;
  try {
    await garage.reserveSlot(h.db, { orchestratorId: 'orch', workerId: idle.id,
      name: 'Fixture workload', role: 'implementation', mission: 'Hash a bounded synthetic payload' });
    state.active.set(idle.id, state.pending.shift());
  } catch (error) {
    if (!['GNS_ADMISSION_INHIBITED','WORKER_GARAGE_FULL'].includes(error.code)) throw error;
    state.deferred += 1;
  }
}

async function arm(input) {
  const cleanup = [];
  const h = await fixture({ after: fn => cleanup.push(fn) });
  try {
    await enroll(h, { holdMs: 5000 });
    process.env.GENOS_NERVOUS_ENABLED = input.gns ? '1' : '0';
    const state = { pending: workload.jobs(input.seed), active: new Map(), completed: [], attempts: 0, deferred: 0 };
    let sensorMs = 0;
    let peakOccupied = 0;
    for (let round = 0; round < input.rounds; round += 1) {
      const started = performance.now();
      await regulator.sampleManager(h.db, 'orch');
      sensorMs += performance.now() - started;
      for (let attempt = 0; attempt < input.perRound; attempt += 1) await admission(h, state);
      peakOccupied = Math.max(peakOccupied, state.active.size);
      const completed = workload.service(state.active, round);
      for (const result of completed) await garage.releaseSlot(h.db, { orchestratorId: 'orch', workerId: result.workerId });
      state.completed.push(...completed);
      if (round < input.rounds - 1) await pause(1050);
    }
    return { gns: input.gns, seed: input.seed, rounds: input.rounds,
      admissionAttemptBudget: input.rounds * input.perRound, serviceQuantumBudget: input.rounds * 3,
      submittedJobs: 12, attempts: state.attempts, deferred: state.deferred, peakOccupied,
      completed: state.completed.length, oracleAccepted: state.completed.filter(row => row.valid).length,
      unfinished: state.pending.length + state.active.size, sensorMs: Number(sensorMs.toFixed(2)),
      episodes: (await h.journal.episodes(h.scope, 'orch')).map(row => row.status) };
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}

async function run() {
  const pairs = [];
  for (const [scenario, perRound] of [['steady', 1], ['burst', 3]]) {
    const input = { seed: 17, rounds: 8, perRound };
    const baseline = await arm({ ...input, gns: false });
    const regulated = await arm({ ...input, gns: true });
    pairs.push({ scenario, baseline, regulated, completionDelta: regulated.completed - baseline.completed });
  }
  return { schema: 'genos.gns-regulation-comparison/v1', environment: 'temporary SQLite fixtures',
    model: 'Three service quanta per round, reduced to two above three concurrent fixture workers.',
    limits: ['Synthetic workload, no model providers or real worker processes.',
      'Equal configured budgets; observational paired results do not establish production benefit.'], pairs };
}

if (require.main === module) run().then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run, arm };
