'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createScientificMathematicalRuntime } = require('../../src/services/mathematical/scientificMathematicalRuntime');
const { createFormalizationArtifact } = require('../../src/services/mathematical/formalizationArtifact');
const { executeLeanCheck } = require('../../src/services/epistemicScheduler/leanProcessExecutor');
const { globalRegistry } = require('../../src/services/mathematical/verificationRegistry');

const scope = { organizationId: 'producer-org', projectId: 'producer-project', workspaceId: 'producer-workspace' };

async function setupDatabase(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('producer-workspace','producer-org','producer-project');
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT INTO agents VALUES ('producer-author','producer-workspace');`);
  return db;
}

function configuredRuntime(db, config) {
  let executions = 0;
  const runtime = createScientificMathematicalRuntime({ db, ...scope, senderAgentId: 'producer-author',
    ...config, executor: async request => {
      executions++;
      const result = await executeLeanCheck({ ...request, ...config, timeoutMs: 90000 });
      console.log(JSON.stringify({ phase: 'producer-lean', exitCode: result.exitCode,
        stdout: result.stdout, stderr: result.stderr }));
      return result;
    }, runtimeOptions: { budget: { tokens: 1000, cpu: 3600 }, mutationRate: 0, recombinationRate: 0, hgtRate: 0 } });
  return { ...runtime, executions: () => executions };
}

function initialize(setup, statement) {
  setup.runtime.initialize({ statement, domain: 'general' }, {
    initialNiches: [{ name: 'Live Lean', representation: 'SAT' }], initialStrategies: [['induction']] });
  setup.runtime.formalizationRegistry.add(createFormalizationArtifact({ naturalStatement: statement, formalStatement: statement }));
}

async function qualifyProducer(options) {
  const db = await setupDatabase(options.filename);
  try {
    const positive = configuredRuntime(db, options.config);
    initialize(positive, '∀ n : Nat, n + 0 = n');
    await positive.runtime.step();
    const rows = await db.all('SELECT metadata_json FROM scientific_references');
    assert.ok(rows.length > 0, 'real producer must publish an actually compiled proof');
    assert.ok(positive.executions() >= 2, 'gate and independent authority must compile');
    globalRegistry.clear();
    const resolved = await positive.referenceStore.resolveReference(db,
      { ref: JSON.parse(rows[0].metadata_json), requesterScope: scope });
    assert.match(resolved.content, /^theorem genos_target/);
    const negative = configuredRuntime(db, options.config);
    initialize(negative, '(0 : Nat) = 1');
    await negative.runtime.step();
    assert.ok(negative.executions() > 0, 'false goal must reach real Lean');
    assert.equal((await db.all('SELECT metadata_json FROM scientific_references')).length, rows.length,
      'failed proofs cannot publish a scientific reference');
    assert.equal(negative.runtime.metrics.totalVerified, 0);
    console.log(JSON.stringify({ phase: 'real-producer', published: rows.length,
      positiveLeanExecutions: positive.executions(), negativeLeanExecutions: negative.executions(),
      falsePublicationRefused: true, proofStrategy: 'bounded-strategy-tactics', autonomousServerBootstrap: false }));
  } finally { globalRegistry.clear(); await db.close(); }
}

module.exports = { qualifyProducer };
