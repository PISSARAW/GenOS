'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { recordObservation } = require('../src/services/shev/observationService');
const healing = require('../src/services/shev/healingEpisodeService');

const projectId = 'shev-healing-contract';
const mandate = { purpose: 'Retablir le parcours sous preuves', autoDiagnose: true,
  autoInstrument: false, dimensions: [{ name: 'parcours', expected: 'Parcours sain',
    acceptance: ['Le parcours est reteste apres integration.'] }] };

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test',
    branch: 'codex/ontogenesis', objective: 'retablir', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:test', mandate });
  await recordObservation(db, { id: 'lesion-1', projectId, domain: 'application',
    dimension: 'parcours', kind: 'degradation', epistemicStatus: 'observed',
    source: 'probe:parcours', observedAt: new Date().toISOString(),
    summary: 'Rupture du parcours', evidenceRefs: ['artifact:probe-lesion'] });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const episode = await healing.openEpisode(db, { projectId, observationId: 'lesion-1' });
    const replay = await healing.openEpisode(db, { projectId, observationId: 'lesion-1' });
    assert.equal(replay.id, episode.id);
    assert.equal((await healing.listEpisodeEvents(db, episode.id)).length, 1);
    await assert.rejects(healing.transitionEpisode(db, { episodeId: episode.id,
      toPhase: 'proliferation', reason: 'saut', evidenceRefs: ['artifact:invalid'] }), /Invalid/);
    const path = ['hemostasis', 'inflammation', 'proliferation', 'remodeling', 'healed'];
    for (const toPhase of path) await healing.transitionEpisode(db, { episodeId: episode.id,
      toPhase, reason: `preuve-${toPhase}`, evidenceRefs: [`artifact:${toPhase}`] });
    const stored = await db.get('SELECT * FROM shev_healing_episodes WHERE id = ?', [episode.id]);
    assert.equal(stored.current_phase, 'healed');
    assert.ok(stored.closed_at);
    assert.deepEqual((await healing.listEpisodeEvents(db, episode.id)).map(row => row.to_phase),
      ['lesion', ...path]);
    await assert.rejects(db.run('DELETE FROM shev_healing_events WHERE episode_id = ?', [episode.id]),
      /immutable/);
    await assert.rejects(healing.transitionEpisode(db, { episodeId: episode.id,
      toPhase: 'relapsed', reason: 'tardif', evidenceRefs: ['artifact:late'] }), /Invalid/);
    console.log('SHEV healing contract passed: durable phases, evidence and terminal fencing.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
