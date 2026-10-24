'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { fingerprint } = require('../src/services/stateFingerprint');
const contract = require('../src/services/shev/developmentalCampaignContract');
const campaign = require('../src/services/shev/developmentalFieldCampaignService');
const runner = require('../src/services/shev/developmentalCampaignRunner');
const commands = require('../src/services/shev/developmentalFieldCampaignCliService');
const fixturePath = path.join(__dirname, 'fixtures', 'shev_field_adapter.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (value) => fingerprint(value);
const lock = (name) => ({ digest: hash(name), evidenceHash: hash(`${name}:evidence`) });
const locks = { modelLock: { digest: hash('model') }, toolsLock: { digest: hash('tools') },
  permissionsHash: hash('permissions'), initialSnapshotHash: hash('snapshot') };

function arm(name, budget = { costUsd: 1, tokens: 1000, seconds: 60 }, campaignBudget) {
  return { scope: { organizationId: 'org', projectId: `project-${name}`,
    entityId: `agent-${name}` }, workspaceId: `workspace-${name}`,
  intervention: name === 'control' ? 'baseline' : 'full_arc', ...locks, budget,
  campaignBudget: campaignBudget || { costUsd: 10, tokens: 5000, seconds: 1000 },
  runtimeLock: lock('runtime'), environmentLock: lock('environment'),
  interventionAttestation: { shevEnabled: name === 'treatment',
    evidenceHash: hash(`intervention:${name}`) } };
}

function windows(prefix, count, painExpected) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`,
    taskHash: hash(`${prefix}:task:${index}`), contextHash: hash(`${prefix}:context:${index}`),
    dimension: 'planning', painExpected, scheduledAt: null }));
}

function manifest(options = {}) {
  const campaignId = options.campaignId || `phase7-${Date.now()}-rehearsal`;
  const arms = { control: arm('control', undefined, options.campaignBudget),
    treatment: arm('treatment', undefined, options.campaignBudget) };
  return contract.createManifest({ campaignId, mode: 'protocol',
    coordinator: { organizationId: 'org', projectId: `coord-${campaignId}`, entityId: 'coord' },
    arms, trainingWindows: windows('training', 5, true),
    heldoutWindows: windows('heldout', 5, false), minimumDurationMs: 0,
    thresholds: { minPainEpisodes: 5 } });
}

async function createDb(filename = ':memory:') {
  const db = await open({ filename, driver: sqlite3.Database });
  await require('../src/db/migrations/migrateGvxLedger').migrateGvxLedger(db);
  return db;
}

function temporaryRoot(prefix) {
  const directory = path.join(root, 'artifacts');
  fs.mkdirSync(directory, { recursive: true });
  return fs.mkdtempSync(path.join(directory, prefix));
}

async function createAdapters(executionLog) {
  fs.mkdirSync(path.dirname(executionLog), { recursive: true });
  process.env.GENOS_FIELD_TEST_ROOT = root;
  process.env.SHEV_FIELD_TEST_EXECUTION_LOG = executionLog;
  delete require.cache[require.resolve(fixturePath)];
  return require(fixturePath).createAdapters({});
}

function receiptEvidence(scenario, result) {
  return { scenario, result, evidenceHash: hash({ scenario, result }) };
}

async function replayAfterExecutionFault() {
  const temporary = temporaryRoot('phase7-fault-1-');
  const database = path.join(temporary, 'campaign.sqlite');
  const cacheFile = path.join(temporary, 'runtime-idempotency.json');
  const executionLog = path.join(temporary, 'executions.log');
  let db = await createDb(database);
  let attempts = 0;
  let interrupted = false;
  let input;
  try {
    const adapters = await createAdapters(executionLog);
    const execute = adapters.runtime.executeWindow;
    adapters.runtime.executeWindow = async (request) => {
      attempts += 1;
      const saved = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
      if (saved[request.request.idempotencyKey]) return saved[request.request.idempotencyKey];
      const result = await execute(request);
      saved[request.request.idempotencyKey] = result;
      fs.writeFileSync(cacheFile, JSON.stringify(saved));
      if (!interrupted) {
        interrupted = true;
        throw new Error('injected stop after execution before journal');
      }
      return result;
    };
    input = { db, manifest: manifest(), adapters };
    await assert.rejects(campaign.runCampaign(input), /before journal/);
    await db.close();
    db = await createDb(database);
    const resumedAdapters = await createAdapters(executionLog);
    const resumedExecute = resumedAdapters.runtime.executeWindow;
    resumedAdapters.runtime.executeWindow = async (request) => {
      attempts += 1;
      const saved = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (saved[request.request.idempotencyKey]) return saved[request.request.idempotencyKey];
      const result = await resumedExecute(request);
      saved[request.request.idempotencyKey] = result;
      fs.writeFileSync(cacheFile, JSON.stringify(saved));
      return result;
    };
    input = { ...input, db, adapters: resumedAdapters };
    const report = await campaign.runCampaign(input);
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    assert.equal(report.status, 'protocol_only');
    assert.equal(Object.keys(cache).length, 20);
    assert.equal(attempts, 21);
    const journal = await runner.existingRuns(db, input.manifest);
    assert.equal(journal.control.size, 10);
    assert.equal(journal.treatment.size, 10);
    return receiptEvidence('stop_after_execution_before_journal',
      { effectiveExecutions: Object.keys(cache).length, attempts, resumedAfterDbReopen: true,
        campaignId: input.manifest.campaignId,
        journaledRunsPerArm: [journal.control.size, journal.treatment.size] });
  } finally { await db.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
}

async function replayAfterLostResponse() {
  const temporary = temporaryRoot('phase7-fault-2-');
  const database = path.join(temporary, 'campaign.sqlite');
  const executionLog = path.join(temporary, 'executions.log');
  let db = await createDb(database);
  const adapters = await createAdapters(executionLog);
  let calls = 0;
  const execute = adapters.runtime.executeWindow;
  adapters.runtime.executeWindow = async (input) => { calls += 1; return execute(input); };
  try {
    let input = { db, manifest: manifest(), adapters };
    await assert.rejects(async () => {
      await campaign.runCampaign(input);
      throw new Error('injected response loss after durable journal');
    }, /response loss/);
    await db.close();
    db = await createDb(database);
    const resumedAdapters = await createAdapters(executionLog);
    resumedAdapters.runtime.executeWindow = async () => { calls += 1; throw new Error('duplicate execution'); };
    input = { ...input, db, adapters: resumedAdapters };
    const completed = await campaign.runCampaign(input);
    assert.equal(completed.status, 'protocol_only');
    assert.equal(calls, 20);
    return receiptEvidence('stop_after_journal_before_response',
      { calls, replayedAfterDbReopen: true, campaignId: input.manifest.campaignId });
  } finally { await db.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
}

async function concurrentTicks() {
  const folder = fs.mkdtempSync(path.join(root, 'artifacts', 'phase7-concurrency-'));
  const campaignDir = path.join(folder, 'campaign');
  const manifestPath = path.join(folder, 'manifest.json');
  const executionLog = path.join(folder, 'executions.log');
  process.env.GENOS_FIELD_TEST_ROOT = root;
  process.env.SHEV_FIELD_TEST_EXECUTION_LOG = executionLog;
  process.env.SHEV_FIELD_TEST_DELAY_MS = '10';
  const sealedManifest = manifest();
  fs.writeFileSync(manifestPath, JSON.stringify(sealedManifest));
  try {
    await commands.prepare({ campaignDir, manifestPath, adapterPath: fixturePath });
    await commands.seal({ campaignDir, adapterPath: fixturePath });
    const first = commands.tick({ campaignDir, adapterPath: fixturePath });
    while (!fs.existsSync(executionLog)) await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(commands.tick({ campaignDir, adapterPath: fixturePath }),
      { code: 'SHEV_FIELD_TICK_BUSY' });
    const result = await first;
    assert.equal(result.report.status, 'protocol_only');
    return receiptEvidence('concurrent_ticks_single_claim',
      { campaignId: sealedManifest.campaignId, rejectedCode: 'SHEV_FIELD_TICK_BUSY',
        winnerStatus: result.report.status });
  } finally {
    delete process.env.SHEV_FIELD_TEST_DELAY_MS;
    delete process.env.GENOS_FIELD_TEST_ROOT;
    delete process.env.SHEV_FIELD_TEST_EXECUTION_LOG;
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function rejectProducerAsVerifier() {
  const db = await createDb();
  const adapters = await createAdapters(path.join(root, 'artifacts', `phase7-fault-4-${Date.now()}.log`));
  const sealedManifest = manifest();
  const verify = adapters.verifier.verifyWindow;
  adapters.verifier.verifyWindow = async (input) => ({ ...await verify(input),
    verifierId: input.execution.actorId });
  try {
    await assert.rejects(campaign.runCampaign({ db, manifest: sealedManifest, adapters }),
      { code: 'SHEV_CAMPAIGN_VERIFICATION_INVALID' });
    return receiptEvidence('producer_receipt_rejected_as_verification',
      { campaignId: sealedManifest.campaignId, rejectedCode: 'SHEV_CAMPAIGN_VERIFICATION_INVALID' });
  } finally { await db.close(); }
}

async function rejectArtifactDigestTampering() {
  const db = await createDb();
  const adapters = await createAdapters(path.join(root, 'artifacts', `phase7-fault-5-${Date.now()}.log`));
  const sealedManifest = manifest();
  const measure = adapters.observer.measureWindow;
  adapters.observer.measureWindow = async (input) => {
    const value = await measure(input);
    const body = { ...value, outcome: { ...value.outcome, artifactHash: hash('tampered-artifact') } };
    delete body.measurementHash;
    return { ...body, measurementHash: hash(body) };
  };
  const configured = campaign.createCampaign({ db, manifest: sealedManifest, adapters });
  try {
    await configured.prepare();
    const request = require('../src/services/shev/developmentalCampaignRunner')
      .runOptions({ manifest: configured.manifest, armName: 'control', phase: 'training',
        window: configured.manifest.trainingWindows[0] });
    await assert.rejects(configured.tick(), { code: 'SHEV_FIELD_MEASUREMENT_UNVERIFIED' });
    return receiptEvidence('tampered_artifact_digest_rejected',
      { campaignId: sealedManifest.campaignId, rejectedCode: 'SHEV_FIELD_MEASUREMENT_UNVERIFIED',
        windowId: request.window.id });
  } finally { await db.close(); }
}

async function rejectRuntimeLockDrift() {
  const adapters = await createAdapters(path.join(root, 'artifacts', `phase7-fault-6-${Date.now()}.log`));
  const ensureArm = adapters.workspace.ensureArm;
  adapters.workspace.ensureArm = async (expected) => {
    const attestation = await ensureArm(expected);
    const { attestationHash, ...body } = attestation;
    body.runtimeLock = { ...body.runtimeLock, digest: hash('drifted-runtime') };
    return { ...body, attestationHash: hash(body) };
  };
  const db = await createDb();
  const sealedManifest = manifest();
  try {
    await assert.rejects(campaign.prepareCampaign({ manifest: sealedManifest, adapters }),
      { code: 'SHEV_FIELD_WORKSPACE_UNVERIFIED' });
    return receiptEvidence('runtime_lock_drift_invalidates_workspace',
      { campaignId: sealedManifest.campaignId, rejectedCode: 'SHEV_FIELD_WORKSPACE_UNVERIFIED' });
  } finally { await db.close(); }
}

async function rejectCumulativeBudgetOverrun() {
  const db = await createDb();
  const adapters = await createAdapters(path.join(root, 'artifacts', `phase7-fault-7-${Date.now()}.log`));
  const sealedManifest = manifest({ campaignBudget: { costUsd: 0.15, tokens: 5000, seconds: 1000 } });
  try {
    await assert.rejects(campaign.runCampaign({ db, manifest: sealedManifest, adapters }),
    { code: 'SHEV_CAMPAIGN_CUMULATIVE_BUDGET_EXCEEDED' });
    return receiptEvidence('cumulative_budget_overrun_stops_campaign',
      { campaignId: sealedManifest.campaignId,
        rejectedCode: 'SHEV_CAMPAIGN_CUMULATIVE_BUDGET_EXCEEDED' });
  } finally { await db.close(); }
}

async function rejectReservedTrainingLeakage() {
  const source = { campaignId: 'phase7-reserved-task-rehearsal', mode: 'protocol',
    coordinator: { organizationId: 'org', projectId: 'coord-leak', entityId: 'coord' },
    arms: { control: arm('control'), treatment: arm('treatment') },
    trainingWindows: windows('training', 5, true), heldoutWindows: windows('heldout', 5, false),
    minimumDurationMs: 0, thresholds: { minPainEpisodes: 5 } };
  source.heldoutWindows[0].taskHash = source.trainingWindows[0].taskHash;
  assert.throws(() => contract.createManifest(source), { code: 'SHEV_CAMPAIGN_HOLDOUT_LEAKAGE' });
  return receiptEvidence('reserved_task_rejected_from_training',
    { campaignId: source.campaignId, rejectedCode: 'SHEV_CAMPAIGN_HOLDOUT_LEAKAGE' });
}

async function runScenarios() {
  return [await replayAfterExecutionFault(), await replayAfterLostResponse(),
    await concurrentTicks(), await rejectProducerAsVerifier(),
    await rejectArtifactDigestTampering(), await rejectRuntimeLockDrift(),
    await rejectCumulativeBudgetOverrun(), await rejectReservedTrainingLeakage()];
}

async function main() {
  const scenarios = await runScenarios();
  assert.equal(new Set(scenarios.map((item) => item.scenario)).size, 8);
  if (process.env.SHEV_KEEP_PROTOCOL_ARTIFACTS === '1') {
    const directory = path.join(root, 'artifacts', `phase7-faults-${Date.now()}`);
    fs.mkdirSync(directory, { recursive: true });
    const report = { rehearsalId: 'phase7-fault-injection-rehearsal', mode: 'protocol',
      campaignStatus: 'faults_rejected', benchmarkQualified: false, promotionEligible: false,
      syntheticFixture: true, evidenceSource: 'backend/tests/test_shev_protocol_rehearsal_faults.js',
      scenarios };
    fs.writeFileSync(path.join(directory, 'fault-injection-report.json'),
      `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Protocol fault evidence: ${path.join(directory, 'fault-injection-report.json')}`);
  }
  delete process.env.GENOS_FIELD_TEST_ROOT;
  delete process.env.SHEV_FIELD_TEST_EXECUTION_LOG;
  delete process.env.SHEV_FIELD_TEST_DELAY_MS;
  console.log('SHEV protocol rehearsal fault injections passed (eight scenarios; synthetic protocol only).');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
