'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fingerprint } = require('../src/services/stateFingerprint');
const contract = require('../src/services/shev/developmentalCampaignContract');
const commands = require('../src/services/shev/developmentalFieldCampaignCliService');
const cli = require('../bin/run-shev-field-campaign.cjs');

const ROOT = path.resolve(__dirname, '../..');
const ADAPTER = path.join(__dirname, 'fixtures', 'shev_field_adapter.cjs');
const HASH = (value) => fingerprint(value);
const LOCKS = { modelLock: { digest: HASH('model') }, toolsLock: { digest: HASH('tools') },
  permissionsHash: HASH('permissions'), initialSnapshotHash: HASH('snapshot') };
const CAMPAIGN_BUDGET = { costUsd: 10, tokens: 5000, seconds: 1000 };
const RUNTIME_LOCK = { digest: HASH('runtime'), evidenceHash: HASH('runtime-evidence') };
const ENVIRONMENT_LOCK = { digest: HASH('environment'), evidenceHash: HASH('environment-evidence') };

function arm(name) {
  return { scope: { organizationId: 'org', projectId: `project-${name}`,
    entityId: `agent-${name}` }, workspaceId: `workspace-${name}`,
  intervention: name === 'control' ? 'baseline' : 'full_arc', ...LOCKS,
  budget: { costUsd: 1, tokens: 1000, seconds: 60 }, campaignBudget: CAMPAIGN_BUDGET,
  runtimeLock: RUNTIME_LOCK, environmentLock: ENVIRONMENT_LOCK,
  interventionAttestation: { shevEnabled: name === 'treatment',
    evidenceHash: HASH(`intervention:${name}`) } };
}

function windows(options) {
  return Array.from({ length: options.count }, (_, index) => ({ id: `${options.prefix}-${index}`,
    taskHash: HASH(`${options.prefix}:task:${index}`),
    contextHash: HASH(`${options.prefix}:context:${index}`), dimension: 'planning',
    painExpected: options.painExpected,
    scheduledAt: new Date(options.firstAt + index * options.stepMs).toISOString() }));
}

function manifest(firstAt) {
  const stepMs = 60 * 60 * 1000;
  return contract.createManifest({ campaignId: 'field-cli-test', mode: 'field',
    startedAt: new Date(Date.now() - 1000).toISOString(),
    coordinator: { organizationId: 'org', projectId: 'coord', entityId: 'coordinator' },
    arms: { control: arm('control'), treatment: arm('treatment') },
    trainingWindows: windows({ prefix: 'train', count: 5, painExpected: true,
      firstAt, stepMs }),
    heldoutWindows: windows({ prefix: 'heldout', count: 20, painExpected: false,
      firstAt: firstAt + 80 * stepMs, stepMs }), minimumDurationMs: contract.FIELD_MINIMUM_MS,
    thresholds: { minPainEpisodes: 5 } });
}

async function testLifecycle() {
  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(ROOT, 'artifacts', 'shev-field-cli-'));
  const campaignDir = path.join(temporary, 'campaign');
  const manifestPath = path.join(temporary, 'manifest.json');
  const executionLog = path.join(temporary, 'executions.log');
  process.env.GENOS_FIELD_TEST_ROOT = ROOT;
  process.env.SHEV_FIELD_TEST_EXECUTION_LOG = executionLog;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest(Date.now() + 1500)));
  try {
    const prepared = await commands.prepare({ campaignDir, manifestPath, adapterPath: ADAPTER });
    assert.equal(prepared.command, 'prepare');
    assert.match(prepared.objectHash, /^[a-f0-9]{64}$/);
    const movedAdapter = path.join(temporary, 'moved-adapter.cjs');
    fs.copyFileSync(ADAPTER, movedAdapter);
    await assert.rejects(commands.seal({ campaignDir, adapterPath: movedAdapter }),
      { code: 'SHEV_FIELD_ADAPTER_CHANGED' });
    const sealed = await commands.seal({ campaignDir, adapterPath: ADAPTER });
    assert.equal(sealed.sealed, true);
    const before = await commands.status({ campaignDir });
    assert.equal(before.status, 'not_started');
    assert.deepEqual(before.runs.control, { training: 0, heldout: 0 });
    await new Promise((resolve) => setTimeout(resolve, 1600));
    const first = await commands.tick({ campaignDir, adapterPath: ADAPTER });
    assert.equal(first.report.status, 'in_progress');
    const database = path.join(campaignDir, 'campaign.sqlite');
    const modified = fs.statSync(database).mtimeMs;
    const status = await commands.status({ campaignDir });
    assert.equal(status.runs.control.training, 1);
    assert.equal(status.runs.treatment.training, 1);
    assert.equal(fs.statSync(database).mtimeMs, modified);
    await commands.tick({ campaignDir, adapterPath: ADAPTER });
    const executions = fs.readFileSync(executionLog, 'utf8').trim().split(/\r?\n/);
    assert.equal(executions.length, 2);
    const exported = await commands.exportCampaign({ campaignDir });
    assert.equal(fingerprint(JSON.parse(fs.readFileSync(exported.file, 'utf8'))), exported.exportHash);
    assert.equal(fs.statSync(database).mtimeMs, modified);
  } finally {
    delete process.env.GENOS_FIELD_TEST_ROOT;
    delete process.env.SHEV_FIELD_TEST_EXECUTION_LOG;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function testArguments() {
  assert.deepEqual(cli.parse(['status', '--campaign-dir', 'campaign']), {
    command: 'status', options: { campaignDir: 'campaign',
      manifestPath: undefined, adapterPath: undefined } });
  assert.throws(() => cli.parse(['status', '--campaign-dir']), /Invalid argument/);
}

async function main() {
  testArguments();
  await testLifecycle();
  console.log('SHEV resumable field campaign CLI checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
