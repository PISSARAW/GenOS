'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { tickOnce } = require('../src/services/ontogenesis/tickService');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const { recordProjectEffect } = require('../src/services/shev/effectService');
const { monitorProjectEffect } = require('../src/services/shev/monitoringRuntimeService');
const { decisionFor, reconcileProject } = require('../src/services/shev/healingReconciliationService');
const { getHealingDossier } = require('../src/services/shev/healingDossierService');

const BASE = Date.now() - 60000;
const projectId = 'shev-healing-integration';
const mandate = { purpose: 'Maintenir le parcours', autoDiagnose: true,
  autoInstrument: false, dimensions: [{ name: 'parcours', expected: 'Parcours sain',
    acceptance: ['Verifier le resultat integre.'] }] };

function observation(id, offset, kind = 'state') {
  return { id, projectId, domain: 'application', dimension: 'parcours', kind,
    epistemicStatus: 'observed', source: 'probe:parcours',
    observedAt: new Date(BASE + offset).toISOString(), summary: `Mesure ${id}`,
    evidenceRefs: [`artifact:${id}`] };
}

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test',
    branch: 'codex/ontogenesis', objective: 'maintenir', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:test', mandate });
  await recordObservation(db, observation('lesion', 0, 'degradation'));
  await tickOnce(db, { projectId, owner: 'healing-integration', nowMs: BASE + 1000 });
  return db.get('SELECT * FROM shev_initiatives WHERE project_id = ?', [projectId]);
}

async function recordEffect(db, initiative) {
  await db.run("UPDATE ontogenesis_backlog SET status = 'doing' WHERE id = ?", [initiative.task_id]);
  await reconcileProject(db, { projectId });
  assert.equal((await db.get('SELECT current_phase FROM shev_healing_episodes')).current_phase, 'proliferation');
  await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [initiative.task_id]);
  await recordObservation(db, observation('post-action', 10000));
  await recordProjectEffect(db, { projectId, initiativeId: initiative.id,
    postObservationId: 'post-action', monitoringIntervalMs: 1000,
    verify: async () => ({ result: 'confirmed', verifierRef: 'verifier:effect',
      evidenceRefs: ['artifact:effect-comparison'] }) });
  await reconcileProject(db, { projectId });
}

async function monitor(db, input) {
  await recordObservation(db, observation(input.id, input.offset));
  await monitorProjectEffect(db, { projectId, initiativeId: input.initiative.id,
    observationId: input.id, verify: async () => ({ result: 'confirmed',
      verifierRef: `verifier:${input.id}`, evidenceRefs: [`artifact:comparison-${input.id}`] }) });
  return reconcileProject(db, { projectId });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    const relapse = decisionFor({ current_phase: 'remodeling' }, { monitoring: [
      { id: 'regression-1', result: 'regressed', evidence_json: '["artifact:regression"]' }
    ] });
    assert.equal(relapse.toPhase, 'relapsed');
    const initiative = await setup(db);
    let episode = await db.get('SELECT * FROM shev_healing_episodes');
    assert.equal(episode.current_phase, 'inflammation');
    await recordEffect(db, initiative);
    episode = await db.get('SELECT * FROM shev_healing_episodes');
    assert.equal(episode.current_phase, 'remodeling');
    await monitor(db, { initiative, id: 'window-1', offset: 20000 });
    assert.equal((await db.get('SELECT current_phase FROM shev_healing_episodes')).current_phase, 'remodeling');
    await monitor(db, { initiative, id: 'window-2', offset: 30000 });
    episode = await db.get('SELECT * FROM shev_healing_episodes');
    assert.equal(episode.current_phase, 'healed');
    const phases = await db.all('SELECT to_phase FROM shev_healing_events ORDER BY sequence');
    assert.deepEqual(phases.map(row => row.to_phase),
      ['lesion', 'hemostasis', 'inflammation', 'proliferation', 'remodeling', 'healed']);
    const dossier = await getHealingDossier(db, { projectId, episodeId: episode.id });
    assert.equal(dossier.schema, 'genos.shev-healing-dossier/v1');
    assert.equal(dossier.claims.longitudinalOutcome, 'healed');
    assert.equal(dossier.claims.causalAttribution, 'not_claimed');
    assert.equal(dossier.claims.fieldQualification, 'not_established');
    assert.equal(dossier.timeline.length, 6);
    assert.match(dossier.digest, /^[a-f0-9]{64}$/);
    assert.equal((await getHealingDossier(db, { projectId, episodeId: episode.id })).digest,
      dossier.digest);
    await assert.rejects(getHealingDossier(db, { projectId: 'other', episodeId: episode.id }),
      /not found/);
    console.log('SHEV healing integration passed: tick, Ontogenesis, effect and longitudinal proof.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
