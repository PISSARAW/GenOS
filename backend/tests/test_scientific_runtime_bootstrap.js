'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFormalizationArtifact } = require('../src/services/mathematical/formalizationArtifact');
const { createScientificMathematicalRuntime } = require('../src/services/mathematical/scientificMathematicalRuntime');
const { globalRegistry } = require('../src/services/mathematical/verificationRegistry');

const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const statement = '∀ n : Nat, n + 0 = n';

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
      INSERT INTO workspaces VALUES ('workspace', 'org', 'project');
      CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
      INSERT INTO agents VALUES ('author', 'workspace');`);
    let executions = 0;
    const setup = createScientificMathematicalRuntime({ db,
      executor: async (request) => {
        executions++;
        assert.match(request.source, /theorem genos_target/);
        return { exitCode: 0, toolchainVersion: 'lean-test', axioms: [] };
      },
      toolchainVersion: 'lean-test', environmentDigest: hash('environment'),
      organizationId: 'org', projectId: 'project', workspaceId: 'workspace',
      senderAgentId: 'author', runtimeOptions: { budget: { tokens: 1000, cpu: 3600 } },
    });
    setup.runtime.initialize({ statement, domain: 'general' }, {
      initialNiches: [{ name: 'Test', representation: 'SAT' }],
      initialStrategies: [['induction']],
    });
    setup.runtime.formalizationRegistry.add(createFormalizationArtifact({
      naturalStatement: statement, formalStatement: statement,
    }));
    await setup.runtime.step();
    const row = await db.get(`SELECT metadata_json FROM scientific_references LIMIT 1`);
    assert.ok(row);
    assert.ok(executions >= 2, 'Gate verification and independent attestation must execute.');
    globalRegistry.clear();
    const ref = JSON.parse(row.metadata_json);
    const resolved = await setup.referenceStore.resolveReference(db, { ref,
      requesterScope: { organizationId: 'org', projectId: 'project',
        workspaceId: 'workspace' } });
    assert.match(resolved.content, /^theorem genos_target/);
    console.log('Scientific mathematical runtime: gate, authority, workflow and producer passed.');
  } finally {
    globalRegistry.clear();
    await db.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
