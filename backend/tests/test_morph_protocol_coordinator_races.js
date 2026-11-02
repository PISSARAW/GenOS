'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bindings = require('../src/services/morphProtocol/coordinatorBindings');
const fixture = require('./helpers/morphCoordinatorFixture');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function command(runtime, options) {
  const state = runtime.state(options.id);
  const payload = { transitionId: state.transitionId, planDigest: state.planDigest };
  const overrides = { payload, scope: state.context.scope, causalRefs: [state.lastMessageId] };
  if (options.participant) {
    payload.receiptDigest = bindings.participantReceipt(state, options.participant, 'ready').receiptDigest;
    overrides.sender = options.participant;
    overrides.causalRefs = [state.prepareMessageId];
  }
  return fixture.message(options.type, overrides);
}

async function preparePlan(runtime, plan, scope) {
  const overrides = { payload: { plan } };
  if (scope) overrides.scope = scope;
  await runtime.apply(fixture.message('PROPOSE', overrides));
  for (const type of ['QUIESCE', 'CHECKPOINT', 'PREPARE']) {
    await runtime.apply(command(runtime, { id: plan.transitionId, type }));
  }
  for (const participant of plan.participants) {
    await runtime.apply(command(runtime, { id: plan.transitionId, type: 'READY', participant }));
  }
}

async function oneCommitPerOrganizationVersion() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-cas-'));
  const dbPath = path.join(directory, 'coordinator.db');
  const first = fixture.runtime({ dbPath });
  const second = fixture.runtime({ dbPath });
  try {
    await preparePlan(first, fixture.plan());
    await preparePlan(second, fixture.plan({ transitionId: 'competing-transition' }));
    await first.apply(command(first, { id: 'transition-1', type: 'COMMIT' }));
    const competing = command(second, { id: 'competing-transition', type: 'COMMIT' });
    await assert.rejects(second.apply(competing), /version CAS rejected/);
    const state = second.state('competing-transition');
    assert.equal(state.status, 'ready');
    assert.equal(second.decision(bindings.query(state)), null);
    assert.equal(first.decision(bindings.query(first.state('transition-1'))).decision, 'COMMIT');
    assert.equal(second.history().filter((event) => event.message.type === 'COMMIT').length, 1);
  } finally { first.close(); second.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function independentProjectScopes() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-project-scopes-'));
  const dbPath = path.join(directory, 'coordinator.db');
  const first = fixture.runtime({ dbPath });
  const second = fixture.runtime({ dbPath });
  try {
    await preparePlan(first, fixture.plan());
    const plan = fixture.plan({ transitionId: 'project-two-transition' });
    plan.sourceSnapshot.questions[0].content.description = 'Project two question';
    plan.targetSnapshot.questions[0].content.description = 'Project two question';
    plan.sourceSnapshot.permissions[0].conditions.projectId = 'project-2';
    plan.targetSnapshot.permissions[0].conditions.projectId = 'project-2';
    await preparePlan(second, plan, { organizationId: 'organization-1', projectId: 'project-2' });
    await first.apply(command(first, { id: 'transition-1', type: 'COMMIT' }));
    await second.apply(command(second, { id: 'project-two-transition', type: 'COMMIT' }));
    const firstQuery = bindings.query(first.state('transition-1'));
    const secondQuery = bindings.query(second.state('project-two-transition'));
    assert.equal(first.decision(firstQuery).decision, 'COMMIT');
    assert.equal(second.decision(secondQuery).decision, 'COMMIT');
    assert.equal(first.decision({ ...firstQuery, scope: secondQuery.scope }), null);
    assert.equal(second.decision({ ...secondQuery, scope: firstQuery.scope }), null);
    const rows = first.store.db.prepare('SELECT version FROM morph_coordinator_organizations').all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.version === 2));
  } finally { first.close(); second.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

async function readinessRacesAbort() {
  const entered = deferred();
  const release = deferred();
  const runtime = fixture.runtime({ verifyReady: async (request) => {
    assert.throws(() => { request.query.scope.organizationId = 'mutated'; }, TypeError);
    entered.resolve();
    await release.promise;
    return fixture.receipt(request, 'ready');
  } });
  try {
    await fixture.prepare(runtime, 'prepared');
    const participant = runtime.state('transition-1').plan.participants[0];
    const pending = runtime.apply(fixture.ready(runtime, participant));
    await entered.promise;
    await runtime.apply(fixture.next(runtime, 'ABORT'));
    release.resolve();
    await assert.rejects(pending, /changed concurrently/);
    assert.equal(runtime.state('transition-1').status, 'aborted');
    assert.equal(Object.keys(runtime.state('transition-1').ready).length, 0);
    assert.equal(runtime.decision(bindings.query(runtime.state('transition-1'))).decision, 'ABORT');
  } finally { release.resolve(); runtime.close(); }
}

async function revokedBeforeCommit() {
  let granted = true;
  const runtime = fixture.runtime({ authorize: async () => granted, verifyCheckpoint: async (request) => {
    if (request.stage === 'COMMIT') granted = false;
    return fixture.checkpointReceipt(request);
  } });
  try {
    await fixture.prepare(runtime);
    await assert.rejects(runtime.apply(fixture.next(runtime, 'COMMIT')), /authority rejected or revoked/);
    const state = runtime.state('transition-1');
    assert.equal(state.status, 'ready');
    assert.equal(runtime.decision(bindings.query(state)), null);
    const version = runtime.store.db.prepare('SELECT version FROM morph_coordinator_organizations').get().version;
    assert.equal(version, 1);
  } finally { runtime.close(); }
}

async function expiredBeforeCommit() {
  let now = fixture.NOW;
  const runtime = fixture.runtime({ clock: () => now, verifyCheckpoint: async (request) => {
    if (request.stage === 'COMMIT') now = '2026-11-03T10:00:00.000Z';
    return fixture.checkpointReceipt(request);
  } });
  try {
    await fixture.prepare(runtime);
    await assert.rejects(runtime.apply(fixture.next(runtime, 'COMMIT')), /expired/);
    const state = runtime.state('transition-1');
    assert.equal(state.status, 'ready');
    assert.equal(runtime.decision(bindings.query(state)), null);
  } finally { runtime.close(); }
}

async function finalizationRevocation() {
  let granted = true;
  const runtime = fixture.runtime({ authorize: async () => granted, verifyApplied: async (request) => {
    granted = false;
    return fixture.receipt(request, 'applied');
  } });
  try {
    await fixture.prepare(runtime);
    await runtime.apply(fixture.next(runtime, 'COMMIT'));
    await assert.rejects(runtime.apply(fixture.next(runtime, 'FINALIZE')), /authority rejected or revoked/);
    const state = runtime.state('transition-1');
    assert.equal(state.status, 'committed');
    assert.equal(runtime.decision(bindings.query(state)).decision, 'COMMIT');
  } finally { runtime.close(); }
}

async function main() {
  await oneCommitPerOrganizationVersion();
  await independentProjectScopes();
  await readinessRacesAbort();
  await revokedBeforeCommit();
  await expiredBeforeCommit();
  await finalizationRevocation();
  console.log('MORPH coordinator organization CAS, races, expiry and authority revocation passed.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
