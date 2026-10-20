'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { compilePending } = require('../src/services/shev/initiativeService');
const { assessWebsite } = require('../src/services/shev/websiteStewardshipService');
const { createWebsiteCandidate,
  attachVerifiedReview } = require('../src/services/shev/websiteCandidateService');
const { recordWebsiteAssessment,
  recordLongitudinalWebsiteEffect } = require('../src/services/shev/adapters/websiteStewardshipAdapter');

const sensors = ['analytics', 'seo', 'geo', 'links', 'content', 'appsec'];

function iso(offsetMs) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function assessment(environment, offsetMs, verdicts = {}) {
  const assessedAt = iso(offsetMs);
  const prefix = environment === 'preview' ? 'preview' : 'production';
  return assessWebsite({ projectId: 'website-effect', dimension: 'site', environment, assessedAt,
    targetUrl: environment === 'preview' ? 'https://preview.example.test' : 'https://example.test',
    readings: sensors.map((sensor) => ({ sensor, environment,
      verdict: verdicts[sensor] || 'stable', source: `${prefix}-${sensor}-api`,
      verifierRef: `${prefix}-${sensor}:v1`, observedAt: iso(offsetMs - 60000),
      validUntil: iso(offsetMs + 3600000),
      evidenceRefs: [`${prefix}:${sensor}:${assessedAt}`] })) });
}

async function setup(db) {
  await store.createProject(db, { id: 'website-effect', rootPath: process.cwd(),
    branch: 'codex/website', objective: 'maintenir le site', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: 'website-effect', authorityRef: 'delegation:web-review',
    mandate: { purpose: 'Maintenir le site', autoDiagnose: true, autoInstrument: true,
      dimensions: [{ name: 'site', expected: 'Site utile, visible et sûr',
        acceptance: ['Effet utilisateur et sécurité vérifiés en production.'] }] } });
  await db.run("UPDATE ontogenesis_control SET mode = 'running' WHERE project_id = ?", ['website-effect']);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    await recordWebsiteAssessment(db, assessment('production', -432000000, { seo: 'degradation' }));
    await compilePending(db, { projectId: 'website-effect', nowMs: Date.now() - 431000000 });
    const initiative = await db.get('SELECT * FROM shev_initiatives WHERE project_id = ?', ['website-effect']);
    assert.equal(initiative.status, 'queued');
    await db.run("UPDATE ontogenesis_backlog SET status = 'done' WHERE id = ?", [initiative.task_id]);
    const preview = assessment('preview', -345600000);
    const raw = createWebsiteCandidate({ projectId: 'website-effect', initiativeId: initiative.id,
      branch: 'codex/site-fix', sandboxRef: 'capsule:site-fix', previewAssessment: preview });
    const candidate = attachVerifiedReview(raw, { verified: true, authorityType: 'policy',
      reviewerRef: 'policy:web-v3', decision: 'approved', reviewedAt: iso(-300000000),
      evidenceRefs: ['review:policy:1'] });
    const input = { candidate, deployment: { authorized: true,
      authorityRef: 'authorization:deployment:1', productionUrl: 'https://example.test',
      deployedAt: iso(-259200000), evidenceRefs: ['deployment:receipt:1'] },
    windows: [assessment('production', -172800000), assessment('production', -86400000),
      assessment('production', -60000)] };
    const verified = await recordLongitudinalWebsiteEffect(db, input);
    assert.equal(verified.receipt.result, 'confirmed');
    assert.equal(verified.effect.project_result, 'confirmed');
    assert.equal(verified.effect.agent_result, 'not_tested');
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_watches')).n, 1);
    console.log('Longitudinal website user and AppSec effect gate passed.');
  } finally {
    await db.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
