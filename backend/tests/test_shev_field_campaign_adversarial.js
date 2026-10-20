'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fingerprint } = require('../src/services/stateFingerprint');
const contract = require('../src/services/shev/developmentalCampaignContract');
const commands = require('../src/services/shev/developmentalFieldCampaignCliService');
const files = require('../src/services/shev/developmentalFieldCampaignStore');

const ROOT = path.resolve(__dirname, '../..');
const ADAPTER = path.join(__dirname, 'fixtures', 'shev_field_adapter.cjs');
const HASH = (value) => fingerprint(value);
const HOUR = 60 * 60 * 1000;

function arm(name) {
  return { scope: { organizationId: 'org', projectId: `adversarial-${name}`,
    entityId: `agent-${name}` }, workspaceId: `workspace-${name}`,
  intervention: name === 'control' ? 'baseline' : 'full_arc',
  initialSnapshotHash: HASH('snapshot'), modelLock: { digest: HASH('model') },
  toolsLock: { digest: HASH('tools') }, permissionsHash: HASH('permissions'),
  budget: { costUsd: 1, tokens: 1000, seconds: 60 },
  campaignBudget: { costUsd: 10, tokens: 5000, seconds: 1000 },
  runtimeLock: { digest: HASH('runtime'), evidenceHash: HASH('runtime-evidence') },
  environmentLock: { digest: HASH('environment'), evidenceHash: HASH('environment-evidence') },
  interventionAttestation: { shevEnabled: name === 'treatment',
    evidenceHash: HASH(`intervention:${name}`) } };
}

function windows(options) {
  return Array.from({ length: options.count }, (_, index) => ({
    id: `${options.prefix}-${index}`, taskHash: HASH(`${options.prefix}:task:${index}`),
    contextHash: HASH(`${options.prefix}:context:${index}`), dimension: 'planning',
    painExpected: options.painExpected,
    scheduledAt: new Date(options.firstAt + index * options.stepMs).toISOString() }));
}

function manifest(now) {
  return contract.createManifest({ campaignId: 'field-adversarial-test', mode: 'field',
    startedAt: new Date(now).toISOString(),
    coordinator: { organizationId: 'org', projectId: 'adversarial-coord',
      entityId: 'coordinator' }, arms: { control: arm('control'), treatment: arm('treatment') },
    trainingWindows: windows({ prefix: 'train', count: 5, painExpected: true,
      firstAt: now + HOUR, stepMs: HOUR }),
    heldoutWindows: windows({ prefix: 'heldout', count: 20, painExpected: false,
      firstAt: now + 6 * HOUR, stepMs: 4 * HOUR }),
    minimumDurationMs: contract.FIELD_MINIMUM_MS,
    thresholds: { minPainEpisodes: 5, minConfirmedHeldout: 2 } });
}

async function withClock(initial, action) {
  const realNow = Date.now;
  const clock = { now: initial };
  Date.now = () => clock.now;
  try { return await action(clock); } finally { Date.now = realNow; }
}

function tempCampaign() {
  fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, 'artifacts', 'shev-field-adversarial-'));
  return { root, campaignDir: path.join(root, 'campaign'),
    manifestPath: path.join(root, 'manifest.json'),
    executionLog: path.join(root, 'executions.log') };
}

function configureFixture(paths) {
  process.env.GENOS_FIELD_TEST_ROOT = ROOT;
  process.env.SHEV_FIELD_TEST_EXECUTION_LOG = paths.executionLog;
}

function clearFixture() {
  delete process.env.GENOS_FIELD_TEST_ROOT;
  delete process.env.SHEV_FIELD_TEST_EXECUTION_LOG;
}

async function testCompleteReplayAndTampering() {
  const paths = tempCampaign();
  const startedAt = Date.now();
  configureFixture(paths);
  fs.writeFileSync(paths.manifestPath, JSON.stringify(manifest(startedAt)));
  try {
    await withClock(startedAt, async (clock) => {
      await commands.prepare({ ...paths, adapterPath: ADAPTER });
      await commands.seal({ campaignDir: paths.campaignDir, adapterPath: ADAPTER });
      clock.now += 83 * HOUR;
      const first = await commands.tick({ campaignDir: paths.campaignDir, adapterPath: ADAPTER });
      assert.equal(first.report.status, 'field_evidence_complete');
      assert.equal(first.report.benchmarkQualified, true);
      assert.equal(first.report.promotionEligible, false);
      const calls = fs.readFileSync(paths.executionLog, 'utf8').trim().split(/\r?\n/);
      assert.equal(calls.length, 50);
      const replay = await commands.tick({ campaignDir: paths.campaignDir, adapterPath: ADAPTER });
      assert.deepEqual(replay.report, first.report);
      assert.equal(fs.readFileSync(paths.executionLog, 'utf8').trim().split(/\r?\n/).length, 50);
      const exported = await commands.exportCampaign({ campaignDir: paths.campaignDir });
      const repeated = await commands.exportCampaign({ campaignDir: paths.campaignDir });
      assert.equal(repeated.exportHash, exported.exportHash);
      fs.writeFileSync(exported.file, '{"tampered":true}\n');
      await assert.rejects(commands.exportCampaign({ campaignDir: paths.campaignDir }),
        { code: 'SHEV_FIELD_OBJECT_CONFLICT' });
      const store = files.createStore(paths.campaignDir);
      const pointer = files.readJson(store.seal);
      const sealedObject = path.join(store.objects, `${pointer.objectHash}.json`);
      fs.writeFileSync(sealedObject, '{"tampered":true}\n');
      await assert.rejects(commands.status({ campaignDir: paths.campaignDir }),
        { code: 'SHEV_FIELD_OBJECT_CONFLICT' });
    });
  } finally {
    clearFixture();
    fs.rmSync(paths.root, { recursive: true, force: true });
  }
}

async function testTickLockFencingAndRecovery() {
  const paths = tempCampaign();
  const store = files.createStore(paths.campaignDir);
  try {
    await files.withTickLock(store, async () => {
      await assert.rejects(files.withTickLock(store, async () => {}),
        { code: 'SHEV_FIELD_TICK_BUSY' });
    });
    fs.writeFileSync(store.lock, JSON.stringify({ pid: 2147483647,
      acquiredAt: new Date().toISOString() }));
    let recovered = false;
    await files.withTickLock(store, async () => { recovered = true; });
    assert.equal(recovered, true);
    assert.equal(fs.existsSync(store.lock), false);
  } finally { fs.rmSync(paths.root, { recursive: true, force: true }); }
}

async function main() {
  await testCompleteReplayAndTampering();
  await testTickLockFencingAndRecovery();
  console.log('SHEV field campaign adversarial checks passed (simulated clock; no field claim).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
