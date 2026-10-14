'use strict';

const assert = require('assert');
const {
  DIMENSIONS, buildIdentityDossier, validateIdentityDossier
} = require('../src/services/agentIdentityDossierService');

function row(id, mode = 'worker') {
  return { id, name: id, role: mode, execution_mode: mode,
    status: 'running', created_at: '2026-10-14T08:00:00Z',
    updated_at: '2026-10-14T08:01:00Z', parent_agent_id: 'parent-1' };
}

function checkUniversalContract() {
  for (const mode of ['worker', 'orchestrator']) {
    const dossier = buildIdentityDossier({ agentId: `${mode}-1`, agentRow: row(`${mode}-1`, mode) });
    assert(validateIdentityDossier(dossier));
    assert.strictEqual(Object.keys(dossier.dimensions).length, DIMENSIONS.length);
    assert.strictEqual(dossier.kind, mode);
    assert.strictEqual(dossier.dimensions.composition.status, 'unknown');
    assert.strictEqual(dossier.dimensions.biology.status, 'unknown');
    assert.strictEqual(dossier.dimensions.governance.status, 'unknown');
    assert.strictEqual(dossier.decisionConstraints.mayAct, false);
    assert.strictEqual(dossier.decisionConstraints.reason, 'CONTINUITY_UNVERIFIED');
  }
  const roleOnly = buildIdentityDossier({ agentId: 'orchestrator-role',
    agentRow: { ...row('orchestrator-role'), role: 'orchestrator', execution_mode: 'autonomous' } });
  assert.strictEqual(roleOnly.kind, 'orchestrator');
}

function checkRegistrationAndTerminalState() {
  const absent = buildIdentityDossier({ agentId: 'unregistered' });
  assert.strictEqual(absent.decisionConstraints.mayAct, false);
  assert.strictEqual(absent.decisionConstraints.reason, 'UNREGISTERED_IDENTITY');
  const terminated = buildIdentityDossier({ agentId: 'worker-2',
    agentRow: { ...row('worker-2'), status: 'terminated' } });
  assert.strictEqual(terminated.decisionConstraints.reason, 'TERMINAL_STATE');
  assert.strictEqual(terminated.decisionConstraints.mayAct, false);
}

function checkForkAndModelChange() {
  const parent = buildIdentityDossier({ agentId: 'parent-1', agentRow: row('parent-1') });
  const child = buildIdentityDossier({ agentId: 'child-1', agentRow: row('child-1') });
  assert.notStrictEqual(parent.version, child.version);
  assert.strictEqual(child.dimensions.continuity.status, 'unknown');
  assert.strictEqual(child.declaredLineage.value.parentId, 'parent-1');
  const switched = buildIdentityDossier({ agentId: 'parent-1',
    agentRow: { ...row('parent-1'), model_tier: 'local' } });
  assert.strictEqual(parent.agentId, switched.agentId);
  assert.notStrictEqual(parent.version, switched.version);
  assert.strictEqual(switched.dimensions.substrate.value.modelTier, 'local');
}

function checkDaemon() {
  const daemon = { daemonId: 'daemon.one', territoryId: 'territory-1',
    activity: 'DORMANT', health: 'HEALTHY', revisions: 1,
    createdAt: '2026-10-14T08:00:00Z', genomeRef: 'agents/daemons/resident_daemon.agent.json' };
  const first = buildIdentityDossier({ agentId: daemon.daemonId, daemon });
  const resumed = buildIdentityDossier({ agentId: daemon.daemonId,
    daemon: { ...daemon, resumed: true } });
  assert(validateIdentityDossier(first));
  assert.strictEqual(first.kind, 'daemon');
  assert.strictEqual(first.dimensions.existence.value.bornAt, resumed.dimensions.existence.value.bornAt);
  assert.strictEqual(first.dimensions.composition.status, 'known');
  assert.strictEqual(first.dimensions.governance.status, 'unknown');
  const apoptotic = buildIdentityDossier({ agentId: daemon.daemonId,
    daemon: { ...daemon, health: 'APOPTOTIC' } });
  assert.strictEqual(apoptotic.decisionConstraints.mayAct, false);
}

checkUniversalContract();
checkRegistrationAndTerminalState();
checkForkAndModelChange();
checkDaemon();
console.log('Agent identity dossier: all cases passed');
