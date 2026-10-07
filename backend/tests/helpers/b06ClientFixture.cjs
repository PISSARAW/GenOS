'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

async function prepare() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-b06-clients-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'b06-isolated-test-only';
  process.env.GENOS_PROMOTION_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_WORKSPACE_ROOT = root;
  const spec = await require('./consumerPromotionFixture.cjs').prepare(root);
  const token = crypto.randomBytes(32).toString('hex');
  await spec.db.run("INSERT INTO organizations (id, name) VALUES ('b06-org', 'B06 consumers')");
  for (const project of ['b06-project', 'b06-other']) {
    await spec.db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', project, 'b06-org', project);
    await spec.db.run("INSERT INTO project_memberships (principal_id, project_id, role) VALUES ('b06-key', ?, 'member')", project);
  }
  await spec.db.run(`INSERT INTO access_keys (id, key_hash, label, role) VALUES ('b06-key', ?, 'B06 operator', 'operator')`,
    crypto.createHash('sha256').update(token).digest('hex'));
  await spec.db.run("UPDATE workspaces SET organization_id = 'b06-org', project_id = 'b06-project' WHERE id = 'consumer-ws'");
  await spec.db.run('UPDATE agents SET fleet_id = ? WHERE id = ?', spec.run.id, 'consumer-promotion-agent');
  await spec.db.run(`INSERT INTO trinity_worlds (id, mission, world_number, name, strategy, status, agent_id)
    VALUES (?, ?, 1, 'B06 consumer', 'promotion qualification', 'running', 'consumer-promotion-agent')`,
  `${spec.run.id}_world_1`, `Qualification B06 ${spec.run.id}`);
  return { ...spec, root, token, settings: { url: 'http://127.0.0.1:14600', organization: 'b06-org',
    project: 'b06-project', workspace: 'consumer-ws', agent: 'consumer-promotion-agent' } };
}

function approval(spec) {
  const payload = { runId: spec.run.id, timestamp: Date.now(), signerId: 'b06-independent-reviewer' };
  return { ...payload, signature: require('../../src/services/promotionSignatureService').generateSignature(payload), ...spec.options };
}

module.exports = { prepare, approval };
