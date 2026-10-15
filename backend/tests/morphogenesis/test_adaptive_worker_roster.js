'use strict';

const assert = require('node:assert/strict');
const { executorCatalog } = require('../../src/services/agents/workerExecutorRegistry');
const { buildAdaptiveWorkerRoster } = require('../../src/services/morphogenesis/adaptiveWorkerRoster');

function main() {
  const catalog = executorCatalog();
  const scanKinds = catalog.filter(entry => entry.methods.includes('scan_literal')).map(entry => entry.kind);
  assert.deepEqual(scanKinds, ['scout_cell'], 'options must come from registered native executors');

  const absent = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', requested: true, methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], workerAssignments: [{ workerKind: 'bounded_worker', methodContract: { methodId: 'scan_literal' } }] });
  const absentOption = absent.phases[0].options[0];
  assert.equal(absentOption.workerKind, 'scout_cell');
  assert.equal(absentOption.retained, false, 'an unassigned kind cannot be retained');
  assert.ok(absentOption.reasons.includes('matching worker assignment is absent'));
  assert.equal(absent.executionAuthorized, false);

  const wrongMethod = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], workerAssignments: [{ workerKind: 'scout_cell',
      methodContract: { methodId: 'monitor_samples' } }] });
  assert.equal(wrongMethod.phases[0].retained.length, 0,
    'an assigned worker kind with a different method cannot be retained');
  assert.match(wrongMethod.phases[0].options[0].reasons.join(' '), /different method/);
  assert.equal(wrongMethod.phases[0].options[0].assignmentStatus, 'method_conflict');

  const nestedContract = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], workerAssignments: [{ workerKind: 'scout_cell',
      workerAssignment: { methodContract: { methodId: 'monitor_samples' } } }] });
  assert.equal(nestedContract.phases[0].retained.length, 0,
    'nested explicit method contracts must remain protected');

  const assigned = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', requested: true, methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], workerAssignments: [{ workerId: 'worker-scout', workerKind: 'scout_cell',
      methodContract: { methodId: 'scan_literal' } }] });
  assert.equal(assigned.phases[0].retained.length, 1);
  assert.equal(assigned.phases[0].retained[0].assignmentId, 'worker-scout');
  assert.equal(assigned.phases[0].retained[0].alreadyConfigured, true);
  assert.equal(assigned.phases[0].retained[0].bindable, false);
  assert.equal(assigned.phases[0].retained[0].eligibleForAttachment, false);
  assert.equal(assigned.phases[0].retained[0].runtimeStatus, 'unknown');

  const observed = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], runtimeSnapshot: { authority: 'genos_database_read_only',
      observedAt: Date.now(), workers: [{ instanceId: 'worker-scout', status: 'idle_observed', reason: 'database_status_only' }] },
    workerAssignments: [{ agentId: 'worker-scout', workerKind: 'scout_cell' }] });
  const observedOption = observed.phases[0].retained[0];
  assert.equal(observedOption.assignmentId, 'worker-scout');
  assert.equal(observedOption.runtimeStatus, 'idle_observed');
  assert.equal(observedOption.runtimeReason, 'database_status_only');
  assert.equal(observedOption.eligibleForAttachment, true,
    'an idle database observation remains advisory and does not grant admission');

  const busy = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], runtimeSnapshot: { observedAt: Date.now(),
      workers: [{ instanceId: 'worker-busy', status: 'busy', reason: 'worker_or_lease_active' }] },
    workerAssignments: [{ id: 'worker-busy', workerKind: 'scout_cell' }] });
  assert.equal(busy.phases[0].options[0].runtimeStatus, 'busy');
  assert.equal(busy.phases[0].retained.length, 0,
    'a concrete busy instance cannot be selected for method attachment');

  const unavailable = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], runtimeSnapshot: { observedAt: Date.now(),
      workers: [{ instanceId: 'worker-gone', status: 'unavailable', reason: 'worker_not_runnable' }] },
    workerAssignments: [{ id: 'worker-gone', workerKind: 'scout_cell' }] });
  assert.equal(unavailable.phases[0].retained.length, 0);

  const stale = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], runtimeSnapshot: { observedAt: Date.now() - 60000,
      workers: [{ instanceId: 'worker-scout', status: 'idle_observed' }] },
    workerAssignments: [{ id: 'worker-scout', workerKind: 'scout_cell' }] });
  assert.equal(stale.phases[0].retained[0].runtimeStatus, 'unknown');

  const unboundAssignment = { workerId: 'worker-unbound', workerKind: 'scout_cell', leaseId: 'lease-preserved' };
  const beforeUnbound = structuredClone(unboundAssignment);
  const bindable = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    availableCapabilities: ['observe'], workerAssignments: [unboundAssignment] });
  const bindableOption = bindable.phases[0].retained[0];
  assert.equal(bindableOption.bindable, true, 'compatible unbound assignments can accept a method binding');
  assert.equal(bindableOption.alreadyConfigured, false);
  assert.equal(bindableOption.eligibleForAttachment, true);
  assert.deepEqual(unboundAssignment, beforeUnbound, 'roster analysis must preserve the assignment and lease');

  const daemonUnspecified = buildAdaptiveWorkerRoster({ phases: [{ id: 'monitor', requested: true,
    methods: ['monitor_samples'] }], availableCapabilities: ['observe', 'execute'],
  workerAssignments: [{ workerId: 'daemon-1', workerKind: 'resident_daemon',
    methodContract: { methodId: 'monitor_samples' } }] });
  const daemonOption = daemonUnspecified.phases[0].options[0];
  assert.equal(daemonOption.daemonStatus, 'authorization_missing');
  assert.equal(daemonOption.retained, false);
  assert.equal(daemonUnspecified.daemonAuthorization, 'not_supplied');

  const daemonAllowed = buildAdaptiveWorkerRoster({ phases: [{ id: 'monitor', methods: ['monitor_samples'] }],
    availableCapabilities: ['observe', 'execute'], daemonAllowed: true,
    workerAssignments: [{ workerKind: 'resident_daemon', methodContract: { methodId: 'monitor_samples' } }] });
  assert.equal(daemonAllowed.phases[0].retained.length, 1);
  assert.equal(daemonAllowed.phases[0].retained[0].daemonStatus, 'explicitly_allowed');

  const unknownCapabilities = buildAdaptiveWorkerRoster({ phases: [{ id: 'observe', methods: ['scan_literal'] }],
    workerAssignments: [{ workerKind: 'scout_cell', methodContract: { methodId: 'scan_literal' } }] });
  assert.equal(unknownCapabilities.phases[0].options[0].capabilitiesKnown, false);
  assert.equal(unknownCapabilities.phases[0].retained.length, 0,
    'missing capability inventory must not be treated as verified compatibility');
}

main();
