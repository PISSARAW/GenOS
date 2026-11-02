'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, occupancy, pause } = require('./regulationFixture');
const regulator = require('../../src/services/nervous/regulationRuntime');
const shev = require('../../src/services/nervous/shevAdapter');

test('SHEV consumes native Garage recovery with real sample references instead of invented telemetry references', async t => {
  const h = await fixture(t);
  await h.db.exec(`ALTER TABLE shev_responsibilities ADD COLUMN stage TEXT DEFAULT 'observing';
    ALTER TABLE shev_responsibilities ADD COLUMN mandate_version INTEGER DEFAULT 1;
    CREATE TABLE shev_mandates(project_id TEXT,version INTEGER,mandate_json TEXT,authority_ref TEXT);
    CREATE TABLE ontogenesis_projects(id TEXT PRIMARY KEY,config_json TEXT);
    CREATE TABLE shev_observations(id TEXT,project_id TEXT,domain TEXT,dimension TEXT,kind TEXT,
      epistemic_status TEXT,source TEXT,observed_at TEXT,valid_until TEXT,summary TEXT,
      evidence_json TEXT,content_hash TEXT,PRIMARY KEY(project_id,id));`);
  await h.db.run('INSERT INTO ontogenesis_projects VALUES(?,?)', 'project',
    JSON.stringify({ gvxScope: { organizationId: 'org' } }));
  await h.db.run('INSERT INTO shev_mandates VALUES(?,1,?,?)', 'project',
    JSON.stringify({ dimensions: [{ name: 'runtime' }], autoDiagnose: false }), 'fixture-mandate');
  await occupancy(h, 1);
  for (let i = 0; i < 3; i += 1) {
    await regulator.sampleManager(h.db, 'orch');
    if (i < 2) await pause(1050);
  }
  const observed = await shev.inspect(h.db, { projectId: 'project', organizationId: 'org',
    agentIds: ['orch'], dimension: 'runtime', sampleRef: 'native-recovery' });
  const [sample] = await h.journal.samples(h.scope, 'orch');
  assert.equal(observed.kind, 'state');
  assert.ok(observed.evidenceRefs.includes(`gns:garage-sample:${sample.id}`));
  assert.ok(observed.evidenceRefs.every(ref => !ref.startsWith('telemetry-event:')));
  assert.equal(Date.parse(observed.observedAt), sample.observedAt);
});
