'use strict';

const { fingerprint } = require('../../src/services/stateFingerprint');
const restoration = require('../../src/services/morphogenesis/runtime/rhizomeRestorationPort');

const NOW = Date.parse('2026-10-20T13:00:00.000Z');
const PRODUCER = 'rhizome-checkpoint-producer';
const VERIFIER = 'rhizome-independent-reader';

function initialState() {
  return {
    schema: restoration.STATE_SCHEMA, sessionId: 'rhizome-session-7', missionId: 'mission-7',
    status: 'ACTIVE',
    variant: { id: 'routing', selection: { reason: 'capability-routing' }, policyVersion: 3 },
    branches: {
      nodes: [{ nodeId: 'root', capabilities: ['route'] }], edges: [],
      activeNeeds: [{ needId: 'need-route', capability: 'route' }], openGaps: [],
      coordinationLoci: [{ locusId: 'locus-root', holderNodeId: 'root', leaseUntil: null }]
    },
    operations: {
      inFlight: [], ledger: [{ operationId: 'op-observed', status: 'completed' }],
      routeLineage: [], routeResults: [], repairScars: []
    },
    leases: { branches: [], coordination: [] },
    checkpoints: { durableId: 'checkpoint-6', journalRevision: 6, graphVersion: 1 },
    resources: { budgets: { growth: 3 }, growthLimits: { nodes: 4 },
      trails: [], oscillators: [] },
    externalBindings: [{ id: 'provider-route', version: '1', digest: 'provider-digest-v1' }]
  };
}

function createFixture(options = {}) {
  let state = initialState();
  if (options.activeLease) state.leases.branches = [{ leaseId: 'lease-active',
    branchId: 'root', ownerId: 'worker', status: 'active',
    expiresAt: new Date(NOW + 60000).toISOString() }];
  let recordRevision = 6;
  let externalBindings = structuredClone(state.externalBindings);
  const events = [];
  const restoreKeys = new Set();
  const store = {
    read: async () => ({ recordRevision, state: structuredClone(state) }),
    quiesce: async (request) => {
      events.push('quiesce');
      state.status = 'DORMANT';
      state.operations.inFlight = [];
      recordRevision += 1;
      return { quiescent: true, token: `token-${request.transitionId}`,
        checkpointId: 'checkpoint-7' };
    },
    adapt: async (request) => {
      assertRevision(request.expectedRecordRevision, recordRevision);
      events.push('adapt');
      state = mergeChanges(state, request.plan.changes);
      recordRevision += 1;
      if (options.externalDivergence) {
        externalBindings = [{ id: 'provider-route', version: '2', digest: 'provider-digest-v2' }];
      }
      return { applied: true };
    },
    replace: async (request) => {
      assertRevision(request.expectedRecordRevision, recordRevision);
      if (restoreKeys.has(request.restoreKey)) throw new Error('duplicate durable restore write');
      restoreKeys.add(request.restoreKey);
      events.push('replace');
      state = structuredClone(request.state);
      recordRevision += 1;
      return { replaced: true };
    },
    finalize: async () => {
      events.push('finalize');
      state.status = 'ACTIVE';
      recordRevision += 1;
      return { finalized: true };
    }
  };
  const reader = {
    read: async () => ({ recordRevision, state: {
      ...structuredClone(state), externalBindings: structuredClone(externalBindings) } })
  };
  const port = restoration.createRhizomeRestorationPort({ store, producerId: PRODUCER,
    qualificationOnly: true, now: () => NOW });
  const verify = restoration.createRhizomeRestorationVerifier({ reader, verifierId: VERIFIER });
  return { store, reader, port, verify, events, state: () => structuredClone(state),
    recordRevision: () => recordRevision, restoreWrites: () => restoreKeys.size };
}

function controlledPlan(snapshotHash = null) {
  return { schema: restoration.PLAN_SCHEMA, sessionId: 'rhizome-session-7',
    expectedSnapshotHash: snapshotHash, production: false,
    operationId: 'morph-operation-7', checkpointId: 'checkpoint-8',
    changes: {
      variant: { id: 'exploratory', selection: { reason: 'bounded-discovery' }, policyVersion: 3 },
      branches: {
        nodes: [{ nodeId: 'root', capabilities: ['route'] },
          { nodeId: 'branch-scout', capabilities: ['discover'] }],
        edges: [{ edgeId: 'edge-scout', from: 'root', to: 'branch-scout' }],
        activeNeeds: [{ needId: 'need-route', capability: 'route' }], openGaps: [],
        coordinationLoci: [{ locusId: 'locus-root', holderNodeId: 'root', leaseUntil: null }]
      },
      operations: {
        inFlight: [], ledger: [{ operationId: 'op-observed', status: 'completed' },
          { operationId: 'morph-operation-7', status: 'completed' }],
        routeLineage: [], routeResults: [], repairScars: []
      },
      checkpoints: { durableId: 'checkpoint-8', journalRevision: 8, graphVersion: 2 }
    }
  };
}

function bindSnapshotHash(plan, snapshotHash) {
  return { ...plan, expectedSnapshotHash: snapshotHash };
}

function mergeChanges(state, changes) {
  const next = structuredClone(state);
  for (const [key, value] of Object.entries(changes)) next[key] = structuredClone(value);
  return next;
}

function snapshotHash(state) {
  const normalized = restoration.normalizeState(state);
  return fingerprint(normalized);
}

function assertRevision(expected, actual) {
  if (expected !== actual) throw Object.assign(new Error('Rhizome record changed concurrently.'),
    { code: 'RHIZOME_RESTORATION_CAS_CONFLICT' });
}

module.exports = { NOW, PRODUCER, VERIFIER, bindSnapshotHash, controlledPlan,
  createFixture, initialState, snapshotHash };
