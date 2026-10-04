'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { recordProjectEffect } = require('../src/services/shev/effectService');
const { requestDevelopment } = require('../src/services/shev/developmentRequestService');
const BASE = Date.now();

const mandate = { purpose: 'Maintenir le parcours utilisateur', autoDiagnose: true,
  autoInstrument: true, dimensions: [{ name: 'parcours', expected: 'Le parcours fonctionne',
    acceptance: ['Le parcours est teste avec une preuve de resultat.'] }] };

async function project(db, id, permissions = mandate) {
  await store.createProject(db, { id, rootPath: 'C:/test', branch: 'codex/ontogenesis',
    objective: 'maintenir le parcours', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: id, authorityRef: `delegation:${id}`, mandate: permissions });
  return id;
}

function observation(projectId, id, overrides = {}) {
  return { id, projectId, domain: 'application', dimension: 'parcours', kind: 'degradation',
    epistemicStatus: 'observed', source: 'probe:parcours', observedAt: new Date(BASE - 7200000).toISOString(),
    validUntil: new Date(BASE + 86400000).toISOString(), summary: 'Echec observe', evidenceRefs: ['artifact:probe-1'],
    ...overrides };
}

async function tick(db, projectId) {
  return tickOnce(db, { projectId, owner: 'shev-test', nowMs: BASE });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await project(db, 'shev-a');
    assert.strictEqual((await tick(db, 'shev-a')).state, 'PLANNING');
    assert.strictEqual((await tick(db, 'shev-a')).state, 'IDLE');
    const first = observation('shev-a', 'failure-1');
    assert.strictEqual((await recordObservation(db, first)).replayed, false);
    assert.strictEqual((await recordObservation(db, first)).replayed, true);
    await assert.rejects(recordObservation(db, { ...first, summary: 'Autre constat' }), /idempotency conflict/);
    assert.strictEqual((await tick(db, 'shev-a')).state, 'PLANNING');
    const initiative = await db.get('SELECT * FROM shev_initiatives WHERE project_id = ?', ['shev-a']);
    assert.strictEqual(initiative.kind, 'diagnose');
    assert.strictEqual(initiative.status, 'queued');
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['shev-a'])).n, 1);
    await tick(db, 'shev-a');
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['shev-a'])).n, 1);
    await assert.rejects(recordProjectEffect(db, { projectId: 'shev-a', initiativeId: initiative.id,
      postObservationId: 'later', verify: async () => ({ result: 'confirmed' }) }), /not complete/);

    await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [initiative.task_id]);
    await recordObservation(db, observation('shev-a', 'recheck-1', {
      observedAt: new Date(BASE - 3600000).toISOString(), kind: 'state', summary: 'Parcours reteste',
      evidenceRefs: ['artifact:probe-2'] }));
    const assessed = await recordProjectEffect(db, { projectId: 'shev-a', initiativeId: initiative.id,
      postObservationId: 'recheck-1', verify: async () => ({ result: 'confirmed',
        verifierRef: 'verifier:independent-1', evidenceRefs: ['artifact:comparison-1'] }) });
    assert.strictEqual(assessed.project_result, 'confirmed');
    assert.strictEqual(assessed.agent_result, 'not_tested');
    assert.strictEqual((await recordProjectEffect(db, { projectId: 'shev-a',
      initiativeId: initiative.id, postObservationId: 'recheck-1', verify: async () => { throw Error('replayed'); } })).replayed, true);

    await project(db, 'shev-b', { ...mandate, autoDiagnose: false, autoInstrument: false });
    await recordObservation(db, observation('shev-b', 'failure-1'));
    await tick(db, 'shev-b');
    assert.strictEqual((await db.get('SELECT status FROM shev_initiatives WHERE project_id = ?', ['shev-b'])).status, 'proposed');
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['shev-b'])).n, 0);
    await db.run("UPDATE ontogenesis_control SET mode = 'paused' WHERE project_id = 'shev-b'");
    await recordObservation(db, observation('shev-b', 'failure-2'));
    await tick(db, 'shev-b');
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM shev_initiatives WHERE project_id = ?', ['shev-b'])).n, 1);

    await project(db, 'shev-c');
    await recordObservation(db, observation('shev-c', 'blind-1', { kind: 'blind_spot',
      epistemicStatus: 'unknown', evidenceRefs: [], summary: 'Aucun capteur' }));
    await recordObservation(db, observation('shev-c', 'stale-1', { validUntil: new Date(BASE - 3600000).toISOString() }));
    await tick(db, 'shev-c');
    const initiatives = await db.all('SELECT observation_id, status, reason FROM shev_initiatives WHERE project_id = ?', ['shev-c']);
    assert.strictEqual(initiatives.find((item) => item.observation_id === 'blind-1').status, 'queued');
    assert.strictEqual(initiatives.find((item) => item.observation_id === 'stale-1').reason, 'preuve-perimee');
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['shev-c'])).n, 1);

    await recordObservation(db, observation('shev-c', 'crash-1'));
    await db.run(`INSERT INTO shev_initiatives
      (id, project_id, observation_id, mandate_version, kind, status, reason)
      VALUES ('crash-proposal', 'shev-c', 'crash-1', 1, 'diagnose', 'proposed', 'diagnostic-delegue')`);
    await tick(db, 'shev-c');
    assert.strictEqual((await db.get("SELECT status FROM shev_initiatives WHERE id = 'crash-proposal'")).status, 'queued');
    await tick(db, 'shev-c');
    assert.strictEqual((await db.get('SELECT COUNT(*) AS n FROM ontogenesis_backlog WHERE project_id = ?', ['shev-c'])).n, 2);

    await recordObservation(db, observation('shev-c', 'gap-1', { kind: 'capability_gap',
      summary: 'Echec recurrent de conception', evidenceRefs: ['artifact:failure-series'] }));
    await tick(db, 'shev-c');
    const development = await requestDevelopment(db, { projectId: 'shev-c', observationId: 'gap-1',
      entityId: 'agent-a', scope: { organizationId: 'org-a', projectId: 'shev-c' } });
    assert.strictEqual(development.action.payload.action, 'schedule_experiment');
    assert.strictEqual(development.promotionAllowed, false);
    assert.strictEqual((await requestDevelopment(db, { projectId: 'shev-c', observationId: 'gap-1',
      entityId: 'agent-a', scope: { organizationId: 'org-a', projectId: 'shev-c' } })).action.replayed, true);
    console.log('SHEV project loop checks passed.');
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
