'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { hash } = require('../../src/services/gvxContracts');
const { digest } = require('../../src/services/gvxVerifierRegistry');
const policies = require('../../src/services/agow/agowMechanismPolicyService');

const scope = { organizationId: 'gvx-fixture-org', projectId: 'gvx-fixture-project', entityId: 'gvx-fixture-agent' };
const schema = 'genos.gvx.execution-profile/v1';

function profileFor(root, sources) {
  const condition = (name) => ({ command: 'npm test', suiteHash: hash({ suite: name }), contextHash: hash({ context: name }) });
  return { schema, id: 'functional-policy-fixture', scope, agentId: scope.entityId, cwd: root, sources, runtimeDatabaseFile: path.join(root, 'runtime.sqlite'),
    parentPolicy: { ...policies.DEFAULT_POLICY, plasticity: 'bounded' },
    candidatePolicy: { ...policies.DEFAULT_POLICY, plasticity: 'bounded', regret: 'bounded' },
    model: 'functional-fixture-v1', maxSeconds: 120, maxCost: 1, metrics: ['accuracy', 'safety'],
    predictedMetrics: { accuracy: 1, safety: 1 }, pathwayId: 'fixture-policy',
    assessmentProfile: { id: 'gvx-somatic-conservative-v1', minSamples: 3, rules: [
      { metric: 'accuracy', objective: 'higher', minImprovement: 0.1, maxRegression: 0 },
      { metric: 'safety', objective: 'maintain', minImprovement: 0, maxRegression: 0 } ] },
    conditions: { baseline: condition('paired'), candidate: condition('paired'),
      monitorA: condition('monitor-a'), monitorB: condition('monitor-b'), monitorC: condition('monitor-c') },
    monitorConditions: ['monitorA', 'monitorB', 'monitorC'], allowedActions: ['gvx.somatic.apply', 'gvx.somatic.rollback'] };
}

async function files(root, options) {
  const evaluator = await fs.readFile(path.join(__dirname, 'gvxPolicyEvaluator.cjs'));
  const packageFile = Buffer.from(JSON.stringify({ private: true, scripts: { test: options.regress ? 'node evaluator.cjs --regress-monitor' : 'node evaluator.cjs' } }));
  await fs.writeFile(path.join(root, 'evaluator.cjs'), evaluator);
  await fs.writeFile(path.join(root, 'package.json'), packageFile);
  return [{ path: 'evaluator.cjs', hash: digest(evaluator) }, { path: 'package.json', hash: digest(packageFile) }];
}

async function startChild(env) {
  const child = fork(path.join(__dirname, 'gvxServiceChild.cjs'), [], { env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  let errors = '';
  child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`GVX child timeout: ${errors}`)), 30000);
    child.once('message', (message) => { clearTimeout(timer); resolve(message.port); });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`GVX child exited ${code}: ${errors}`)); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function createFixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-gvx-standard-'));
  const profile = profileFor(root, await files(root, options));
  const profileBytes = Buffer.from(JSON.stringify([profile]));
  const profileFile = path.join(root, 'profiles.json');
  await fs.writeFile(profileFile, profileBytes);
  const keys = crypto.generateKeyPairSync('ed25519');
  const token = crypto.randomBytes(32).toString('hex');
  const env = { ...process.env, GENOS_GVX_VERIFIER_PRIVATE_KEY_FILE: '',
    GENOS_GVX_VERIFIER_MODULE: '', GENOS_GVX_VERIFIER_PRIVATE_KEY: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    GENOS_GVX_VERIFIER_TOKEN: token, GENOS_GVX_EXECUTION_PROFILES_FILE: profileFile,
    GENOS_GVX_EXECUTION_PROFILES_SHA256: digest(profileBytes), GENOS_GVX_EXECUTION_STORE: path.join(root, 'executions') };
  const service = await startChild(env);
  const previous = { ...process.env };
  const remote = { url: service.url, token, publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) };
  Object.assign(process.env, { GENOS_GVX_VERIFIER_URL: remote.url, GENOS_GVX_VERIFIER_TOKEN: token,
    GENOS_GVX_VERIFIER_PUBLIC_KEY: remote.publicKey, GENOS_GVX_VERIFIER_PUBLIC_KEY_FILE: '',
    GENOS_GVX_RUNTIME_PROFILE_ID: profile.id, GENOS_GVX_ARTIFACT_ROOT: path.join(root, 'artifacts'),
    GENOS_GVX_LIFECYCLE_ADAPTER_MODULE: '' });
  const filename = path.join(root, 'runtime.sqlite');
  const db = await openDatabase(filename);
  const fixture = { root, db, filename, remote, profile, service, previous };
  try { await policies.update({ db, agentId: scope.entityId, policy: profile.parentPolicy }); }
  catch (error) { await closeFixture(fixture); throw error; }
  return fixture;
}

async function openDatabase(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await require('../../src/db/migrations/migrateGvxLedger').migrateGvxLedger(db);
  await require('../../src/db/migrations/migrateAdaptiveState').migrateAdaptiveState(db);
  return db;
}

async function closeFixture(fixture) {
  await fixture.db.close();
  fixture.service.child.send('close');
  await new Promise((resolve) => fixture.service.child.once('exit', resolve));
  for (const key of Object.keys(process.env)) if (!(key in fixture.previous)) delete process.env[key];
  Object.assign(process.env, fixture.previous);
  // Only this freshly created test directory is removed.
  await fs.rm(fixture.root, { recursive: true, force: true });
}

module.exports = { createFixture, closeFixture, openDatabase, scope, profileFor };
