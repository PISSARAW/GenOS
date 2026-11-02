'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const collective = require('../../src/services/collectiveStateService');

async function create() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-mission-morph-'));
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace); fs.writeFileSync(path.join(workspace, 'state.txt'), 'native morphology source');
  const environment = Object.fromEntries(['GENOS_ADMIN_PASSWORD', 'GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM', 'GENOS_CLI_AUTHORITY_TRUST_JSON']
    .map(key => [key, process.env[key]]));
  process.env.GENOS_ADMIN_PASSWORD = 'mission-morph-local-test';
  const keys = crypto.generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const keyId = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 32);
  process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = JSON.stringify({ [keyId]: publicKey.toString('hex') });
  const filename = path.join(root, 'control.sqlite');
  const db = await require('../../src/db').getDatabase(filename);
  await db.run("INSERT INTO organizations(id,name) VALUES('morph-org','Morph Org')");
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES('morph-project','morph-org','Morph Project')");
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES('morph-ws','Morph workspace',?,'morph-org','morph-project')", workspace);
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id) VALUES('morph-agent','Morph Agent','orchestrator','idle','orchestrator','morph-ws')");
  const missionId = 'morph-mission';
  await require('../../src/services/missionIdentityService').create(db, { missionId, objective: 'Coordinate actual native morphology' });
  await require('../../src/services/missionIdentityService').attachAgent(db, { missionId, agentId: 'morph-agent', role: 'orchestrator' });
  const req = { user: { username: 'operator' }, tenant: { organizationId: 'morph-org', projectId: 'morph-project' } };
  const state = collective.deserializeState({ mission: { id: missionId },
    agents: { 'morph-agent': { id: 'morph-agent', role: 'orchestrator', status: 'idle', lease: ['read'] } },
    topologyState: { organization: 'trinity', topology: 'trinity', activeSubgraphs: [] },
    budgets: { total: 100, allocated: 20, remaining: 80, perAgent: { 'morph-agent': 20 } } });
  return { root, filename, db, req, collectiveState: state, missionId, agentId: 'morph-agent',
    plan: { id: 'native-mission-morph', missionId, actions: [{ type: 'rebind', agentId: 'morph-agent', targetRole: 'verifier' }],
      targetOrganization: 'rhizome', expectedGain: 0.7, expectedRisk: 0.2, reason: 'native-mission-protocol-transition' },
    async close() {
      await require('../../src/db').closeDatabase();
      fs.rmSync(root, { recursive: true, force: true });
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    } };
}

module.exports = { create };
