'use strict';

const garageFixture = require('../garageFixture');
const { authority } = require('../shevFixture');
const garage = require('../../src/services/workerGarageService');
const policies = require('../../src/services/nervous/regulationPolicy');
const bridge = require('../../src/services/nervous/runtimeBridge');
const { RegulationJournal } = require('../../src/services/nervous/regulationJournal');

async function fixture(t) {
  const before = { enabled: process.env.GENOS_NERVOUS_ENABLED, regulation: process.env.GENOS_NERVOUS_REGULATION };
  process.env.GENOS_NERVOUS_ENABLED = '1'; process.env.GENOS_NERVOUS_REGULATION = 'guarded';
  const h = await garageFixture.fixture();
  const owner = authority();
  await h.db.exec(`CREATE TABLE aeis_agent_dissonance(agent_id TEXT,authority_level INTEGER);
    CREATE TABLE missions(mission_id TEXT PRIMARY KEY,orchestrator_agent_id TEXT,status TEXT);
    CREATE TABLE mission_agents(mission_id TEXT,agent_id TEXT,role TEXT);
    CREATE TABLE agent_identity_heads(agent_id TEXT,organization_id TEXT,project_id TEXT);
    CREATE TABLE shev_responsibilities(project_id TEXT PRIMARY KEY,status TEXT,authority_public_key TEXT);
    CREATE TABLE shev_authorizations(nonce TEXT PRIMARY KEY,project_id TEXT,operation TEXT,payload_json TEXT,signature TEXT);
    CREATE TABLE adaptive_state(scope TEXT,key TEXT,payload_json TEXT,version INTEGER,
      updated_at TEXT,PRIMARY KEY(scope,key));
    CREATE TABLE adaptive_state_events(scope TEXT,key TEXT,event_type TEXT,event_payload TEXT,created_at TEXT);`);
  await h.db.run("INSERT INTO shev_responsibilities VALUES('project','active',?)", owner.publicKey);
  garage.setDynamicCapacity('orch', 5);
  await require('../../src/services/garageDomainService').ensureDomain(h.db, 'orch', 5);
  const runtime = await bridge.getRuntime(h.db);
  const journal = await new RegulationJournal(runtime.store).initialize();
  t.after(async () => {
    garage.releaseDynamicCapacity('orch');
    const current = await bridge.runtimes.get(h.db);
    if (current) await current.store.close();
    bridge.runtimes.delete(h.db);
    await h.close();
    restore('GENOS_NERVOUS_ENABLED', before.enabled); restore('GENOS_NERVOUS_REGULATION', before.regulation);
  });
  return { ...h, owner, runtime, journal, scope: { organizationId: 'org', projectId: 'project' } };
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function enroll(h, patch = {}) {
  const input = { scope: h.scope, managerId: 'orch', actorId: 'orch', expectedVersion: 0,
    holdMs: 15000, expiresAt: Date.now() + 60000, ...patch };
  const details = policies.contract(input);
  const authorization = h.owner.authorize({ operation: 'gns-regulation-enrollment',
    projectId: input.scope.projectId, subjectId: input.managerId, expectedVersion: input.expectedVersion, details });
  return policies.enroll(h.db, { ...input, authorization });
}

async function occupancy(h, count) {
  await h.db.run("UPDATE agents SET status='idle' WHERE execution_mode='worker'");
  for (let i = 1; i <= count; i += 1) await h.db.run("UPDATE agents SET status='running' WHERE id=?", `worker-${i}`);
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = { fixture, enroll, occupancy, pause };
