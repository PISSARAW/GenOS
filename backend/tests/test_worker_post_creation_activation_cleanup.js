'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const missionWorkersPath = path.resolve(__dirname, '../src/services/agentRuntimeAdapter/missionWorkers.js');
const state = { teamRun: { teamRunId: 'team-run', status: 'READY', phase: 'PREBRIEF', revision: 1, members: [] },
  experiment: null, worlds: [], failedCells: [], cleanedWorkspaces: [], failedAgents: [] };
const workers = [1, 2, 3].map((index) => ({ agentId: `worker-${index}`, label: `worker-${index}`,
  role: `role-${index}`, name: `Worker ${index}`, prompt: 'Bounded worker prompt.',
  workspaceRoot: `C:/workspace/${index}`, toolLease: [], executionBudget: { tokens: 100 } }));
const assignments = workers.map(({ agentId, label, role }) => ({ workerId: agentId, label, role,
  chamber: `chamber-${role}` }));
state.teamRun.members = assignments.map((assignment) => ({ ...assignment }));
const cellBridge = {
  async bind(_ctx, entries) {
    entries.forEach((worker) => { worker.cellThreadRuntime = { available: true, workerId: worker.agentId }; });
  },
  async fail(_ctx, entries) { state.failedCells.push(...entries.map((worker) => worker.agentId)); },
  receipts(entries) { return entries.map((worker) => ({ workerId: worker.agentId })); }
};
const teamRunStore = {
  async load() { return { teamRunId: 'team-run', ...state.teamRun }; }
};
const aTeamRuntime = {
  async transitionRun(input) {
    state.teamRun = { ...state.teamRun, ...input.patch, revision: state.teamRun.revision + 1 };
    return state.teamRun;
  }
};
const trinityStore = {
  async create() { state.experiment = { status: 'sealed_running' }; },
  async createWorld(_db, world) { state.worlds.push({ ...world }); },
  async transition(_db, input) { state.experiment.status = input.status; }
};
const dispatchState = { autonomousRounds: new Map(), emit() {} };

function stub(request, parent, mocks) {
  return Object.hasOwn(mocks, request) ? mocks[request] : undefined;
}

const mocks = {
  '../agentFleetService': { async createAutonomousWorkers() { return workers; } },
  '../agentOrchestrationState': dispatchState,
  '../userProgressService': { report() {} },
  '../../db': { async withTransaction(_db, operation) { return operation(_db); } },
  '../trinityExperimentStore': trinityStore,
  '../trinitySnapshotService': { async hashWorkspace() { return 'a'.repeat(64); } },
  '../trinityService': {},
  '../aTeam/aTeamRuntime': aTeamRuntime,
  '../aTeam/teamRunStore': teamRunStore,
  '../trinityHistoricalMemoryService': { async attach(_db, input) { return input.design; } },
  '../morphogenesis/morphogenesisMissionBinding': { bindDispatchAssignments(_plan, entries) {
    return { assignments: entries, binding: null };
  } },
  '../autonomousWorkerCellBridge': cellBridge,
  '../missionIdentityService': { async attachAgent() {}, async create() {} },
  '../trinitySealedSnapshot': { async seal() { return { hash: 'a'.repeat(64), root: 'sealed-root' }; } },
  '../trinityDispatchPreparation': { async bindWorker() { return 'trinity-workspace'; }, restrictLease(_scope, lease) { return lease; } },
  '../trinityWorldDesign': require('../src/services/trinityWorldDesign'),
  './missionWorkersEpochRegistration': { async registerAutonomousRound() {
    throw Object.assign(new Error('injected activation failure'), { code: 'ACTIVATION_INJECTED' });
  } },
  '../agentWorkspaceLifecycleService': { async scheduleWorkspaceCleanup(agentId) {
    state.cleanedWorkspaces.push(agentId);
  } }
};

const originalLoad = Module._load;
Module._load = function loadWithWorkerMocks(request, parent, isMain) {
  const mock = stub(request, parent, mocks);
  return mock === undefined ? originalLoad.call(this, request, parent, isMain) : mock;
};

try {
  delete require.cache[missionWorkersPath];
  const missionWorkers = require(missionWorkersPath);
  const db = {
    async run(sql, ...values) {
      if (sql.includes('UPDATE agents SET status = \'error\'')) {
        state.failedAgents.push(values[1]);
      }
      if (sql.includes('UPDATE trinity_worlds SET status = \'error\'')) {
        state.worlds.forEach((world) => { if (world.status === 'running') world.status = 'error'; });
      }
      return { changes: 1 };
    },
    async get(sql) {
      if (sql.includes('FROM trinity_experiments')) return state.experiment;
      return null;
    }
  };
  const ctx = {
    db, agentId: 'orchestrator', dispatchedAgent: { execution_mode: 'orchestrator' },
    normalizedMission: { missionId: 'mission-1', prompt: 'Compare three workers.', workspaceRoot: 'C:/source',
      autonomousOrchestration: true, executionBudget: { latencyMs: 30000 } },
    executionRun: { id: 'run-1' }, silentUpdates: true,
    autonomyPlan: {
      workers: assignments, dispatchWorkers: assignments,
      aTeam: { activated: true, teamRun: { teamRunId: 'team-run' }, detectedDomains: [] },
      trinity: { activated: true, missionId: null, variantSelection: {}, domain: 'worker-test',
        members: assignments, hypothesisDesign: { variantSelection: {} } },
      tokenPolicy: { total: 300, rounds: { initial: { workerTokens: [100, 100, 100] }, continuation: {} } }
    }
  };

  const failure = Object.assign(new Error('injected activation failure'), { code: 'ACTIVATION_INJECTED' });
  const attachAgent = mocks['../missionIdentityService'].attachAgent;
  mocks['../missionIdentityService'].attachAgent = async (...args) => {
    if (args[1]?.role === 'trinity_worker') return;
    return attachAgent(...args);
  };
  return missionWorkers.orchestrateAutonomousWorkers(ctx).then(
    () => { throw new Error('Expected worker activation to fail.'); },
    (error) => {
      assert.equal(error.code, failure.code, error.stack);
      assert.equal(error.message, failure.message);
      assert.deepEqual(state.failedCells.sort(), workers.map((worker) => worker.agentId).sort());
      assert.deepEqual(state.cleanedWorkspaces.sort(), workers.map((worker) => worker.agentId).sort());
      assert.deepEqual(state.failedAgents.sort(), workers.map((worker) => worker.agentId).sort());
      assert.equal(state.teamRun.status, 'FAILED');
      assert.equal(state.experiment.status, 'escalated');
      assert.ok(state.worlds.length === 3 && state.worlds.every((world) => world.status === 'error'));
      console.log('Post-creation activation failures clean workers, cells, workspaces, A-Team runs, and Trinity worlds.');
    }
  ).finally(() => {
    Module._load = originalLoad;
    delete require.cache[missionWorkersPath];
  });
} catch (error) {
  Module._load = originalLoad;
  delete require.cache[missionWorkersPath];
  throw error;
}
