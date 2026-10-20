'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { compilePending } = require('../src/services/shev/initiativeService');
const { assessWebsite } = require('../src/services/shev/websiteStewardshipService');
const { recordWebsiteAssessment } = require('../src/services/shev/adapters/websiteStewardshipAdapter');

const sensors = ['analytics', 'seo', 'geo', 'links', 'content', 'appsec'];

function readings(verdicts = {}, environment = 'production') {
  return sensors.map((sensor) => ({ sensor, environment,
    verdict: verdicts[sensor] || 'stable', source: `${sensor}-api`,
    verifierRef: `${sensor}-verifier:v1`, observedAt: '2026-10-19T10:00:00.000Z',
    validUntil: '2026-10-20T10:00:00.000Z', evidenceRefs: [`${sensor}:receipt:1`] }));
}

function assessmentInput(verdicts = {}, environment = 'production') {
  return { projectId: 'website-project', dimension: 'site', targetUrl: 'https://example.test',
    environment, assessedAt: '2026-10-19T11:00:00.000Z', readings: readings(verdicts, environment) };
}

async function setup(db) {
  await store.createProject(db, { id: 'website-project', rootPath: process.cwd(),
    branch: 'codex/website', objective: 'maintenir le site', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: 'website-project', authorityRef: 'delegation:web-review',
    mandate: { purpose: 'Maintenir le site', autoDiagnose: true, autoInstrument: true,
      dimensions: [{ name: 'site', expected: 'Site utile, visible et sûr',
        acceptance: ['Effet utilisateur et sécurité vérifiés en production.'] }] } });
  await db.run("UPDATE ontogenesis_control SET mode = 'running' WHERE project_id = ?", ['website-project']);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const stable = assessWebsite(assessmentInput());
    assert.equal(stable.action, 'NO_CHANGE');
    assert.equal(stable.kind, 'state');
    const risk = await recordWebsiteAssessment(db, assessmentInput({ appsec: 'degradation' }));
    assert.equal(risk.assessment.action, 'INITIATE');
    assert.equal(risk.observation.kind, 'risk');
    assert.equal(risk.observation.evidenceRefs.length, 6);
    await compilePending(db, { projectId: 'website-project', nowMs: Date.parse('2026-10-19T11:00:00.000Z') });
    const initiative = await db.get('SELECT * FROM shev_initiatives WHERE project_id = ?', ['website-project']);
    assert.equal(initiative.status, 'proposed');
    assert.equal(initiative.reason, 'autorisation-explicite-requise');
    const stale = assessmentInput({ seo: 'degradation' });
    stale.readings[0].validUntil = '2026-10-19T10:30:00.000Z';
    assert.equal(assessWebsite(stale).action, 'NO_CHANGE');
    await assert.rejects(recordWebsiteAssessment(db,
      assessmentInput({ seo: 'opportunity' }, 'preview')), /previews remain candidates/);
    assert.throws(() => assessWebsite({ ...assessmentInput(), readings: readings().slice(1) }),
      /complete sensor panel/);
    console.log('Website sensor provenance and INITIATE/NO_CHANGE arbitration passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
