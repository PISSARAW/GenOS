const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { spawn } = require('child_process');
const readline = require('readline');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-fossil-cli-'));
const dbPath = path.join(root, 'fossils.db');
const oldSigner = createSigner();
const newSigner = createSigner();
const candidatePath = path.join(root, 'trust-candidate.json');
const activeTrustPath = path.join(root, 'trust-active.json');
const activateScript = path.resolve(__dirname, '../bin/activate-fossil-trust-bundle.cjs');
process.env.GENOS_DB_PATH = dbPath;
process.env.GENOS_STUDIO_ROOT = root;
process.env.GENOS_ADMIN_PASSWORD = 'fossil-backend-cli-e2e';
process.env.GENOS_FOSSIL_ARTIFACT = '1';
process.env.GENOS_FOSSIL_SIGNING_PRIVATE_KEY = oldSigner.privatePem;
process.env.GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS_FILE = activeTrustPath;
process.env.GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS = '';

const cli = process.env.GENOS_BIN || path.resolve(__dirname, '../../target/debug/genos.exe');
const { getDatabase, closeDatabase } = require('../src/db');
const fossilization = require('../src/services/fossilizationService');

async function run() {
  const db = await getDatabase(dbPath);
  const instances = [startVerifier(), startVerifier()];
  try {
    await activateTrust(oldSigner);
    await recordAndVerify(db, instances);
  } finally {
    await Promise.all(instances.map(stopVerifier));
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function recordAndVerify(db, instances) {
  const oldFossil = await recordFossil(db, 'old');
  const originalProof = { ...oldFossil.attestation };
  const oldStoredProof = await storedProof(db, oldFossil.fossil_id);
  await assertInstances(instances, oldFossil, true);

  process.env.GENOS_FOSSIL_SIGNING_PRIVATE_KEY = newSigner.privatePem;
  await activateTrust(oldSigner, newSigner);
  const newFossil = await recordFossil(db, 'new');
  const overlapBundle = trustBundle(oldSigner, newSigner);
  verifyCliFossil(oldFossil, 'old');
  verifyCliFossil(newFossil, 'new');
  await assertInstances(instances, oldFossil, true);
  await assertInstances(instances, newFossil, true);
  assert.deepEqual(await storedProof(db, oldFossil.fossil_id), oldStoredProof,
    'rotating the active key must not rewrite a historical signature');
  assert.deepEqual(oldFossil.attestation, originalProof);
  await verifyKeyIdBinding(oldFossil);

  const retiredBundle = trustBundle(newSigner);
  await activateTrust(newSigner);
  assert.equal(fossilization.verifyAttestation(oldFossil), false,
    'backend verifier must refuse fossils from a removed trust key');
  assert.equal(fossilization.verifyAttestation(newFossil), true,
    'backend verifier must continue to trust the active key');
  await assertInstances(instances, oldFossil, false);
  await assertInstances(instances, newFossil, true);
  const retiredOld = invokeCli(oldFossil.fossil_id);
  assert.notEqual(retiredOld.status, 0, 'removing an old key must refuse its historical fossil');
  assert.match(retiredOld.stderr, /Unknown backend fossil signer/);
  verifyCliFossil(newFossil, 'new');
  const exhaustive = invokeCliCommand(['fossil', 'list']);
  assert.equal(exhaustive.status, 0, exhaustive.stderr);
  const inventory = JSON.parse(exhaustive.stdout);
  assert.equal(inventory.verification_complete, false,
    'listing must expose when historical fossils have an untrusted signer');
  assert.equal(inventory.fossils.find(({ record }) => record.fossil_id === oldFossil.fossil_id)
    ?.authenticity_status, 'signer_not_trusted');
  console.log('Fossil key overlap, rotation, retirement, fingerprint binding and targeted CLI verification: PASS');
}

async function verifyKeyIdBinding(fossil) {
  const forged = { ...fossil, attestation: signWithAlias(fossil, newSigner, oldSigner.keyId) };
  const aliasBundle = trustBundleEntry(oldSigner.keyId, newSigner.publicHex);
  activateTrustFile(aliasBundle);
  assert.equal(fossilization.verifyAttestation(forged), false,
    'backend must reject a trust-map key id that does not fingerprint its public key');

  const file = path.join(root, 'fossils', `fossil-cli-lineage-old_${fossil.fossil_id}.json`);
  const original = fs.readFileSync(file, 'utf8');
  try {
    const artifact = JSON.parse(original);
    artifact.attestation = forged.attestation;
    fs.writeFileSync(file, JSON.stringify(artifact, null, 2));
    const rejected = invokeCli(fossil.fossil_id);
    assert.notEqual(rejected.status, 0, 'CLI must bind a trusted key id to its actual public key');
    assert.match(rejected.stderr, /does not match its public key fingerprint/);
  } finally {
    fs.writeFileSync(file, original);
    activateTrust(oldSigner, newSigner);
  }
}

function createSigner() {
  const signer = crypto.generateKeyPairSync('ed25519');
  const publicDer = signer.publicKey.export({ format: 'der', type: 'spki' });
  return { privatePem: signer.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    keyId: crypto.createHash('sha256').update(publicDer).digest('hex').slice(0, 32),
    publicHex: publicDer.subarray(-32).toString('hex') };
}

function trustBundle(...signers) {
  return JSON.stringify(Object.fromEntries(signers.map(signer => [signer.keyId, signer.publicHex])));
}

function trustBundleEntry(keyId, publicHex) {
  return JSON.stringify({ [keyId]: publicHex });
}

function signWithAlias(fossil, signer, claimedKeyId) {
  const material = { version: 1, algorithm: 'ed25519', key_id: claimedKeyId,
    fossil_id: fossil.fossil_id, source_event_id: fossil.source_event_id,
    source_event_hash: fossil.source_event_hash, extinct_lineage_id: fossil.extinct_lineage_id,
    organization_id: fossil.organization_id || null, project_id: fossil.project_id || null,
    payload_hash: fossil.payload_hash };
  const signature = crypto.sign(null, Buffer.from(fossilization.stableStringify(material)),
    crypto.createPrivateKey(signer.privatePem)).toString('hex');
  return { version: 1, algorithm: 'ed25519', key_id: claimedKeyId, signature };
}

async function recordFossil(db, generation) {
  const lineageId = `fossil-cli-lineage-${generation}`;
  const eventId = `fossil-cli-terminal-event-${generation}`;
  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json, organization_id, project_id)
    VALUES (?, ?, 'AGENT_TERMINATED', 'TERMINATE', 'terminal', '{}', ?, ?)`,
  eventId, lineageId, 'fossil-cli-org', 'fossil-cli-project');
  const result = await fossilization.recordFossil({ lineageId, sourceEventId: eventId,
    organizationId: 'fossil-cli-org', projectId: 'fossil-cli-project' }, db);
  assert(result.success && result.fossil.attestation, 'Backend must persist a signed source event');
  return result.fossil;
}

async function storedProof(db, fossilId) {
  return db.get('SELECT attestation_key_id, attestation_signature FROM fossils WHERE fossil_id = ?', fossilId);
}

function verifyCliFossil(fossil, generation) {
  const excavated = invokeCli(fossil.fossil_id);
  assert.equal(excavated.status, 0, excavated.stderr);
  const output = JSON.parse(excavated.stdout);
  assert.equal(output.provenance_status, 'source_event_attested_by_backend');
  assert.equal(output.specimen.record.source_event_id, `fossil-cli-terminal-event-${generation}`);
}

function invokeCli(fossilId) {
  return invokeCliCommand(['fossil', 'excavate', '--fossil-id', fossilId]);
}

function invokeCliCommand(args) {
  return spawnSync(cli, args, { encoding: 'utf8',
    env: { ...process.env, GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS_FILE: activeTrustPath,
      GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS: '' } });
}

function activateTrust(...signers) {
  activateTrustFile(trustBundle(...signers));
}

function activateTrustFile(bundle) {
  fs.writeFileSync(candidatePath, bundle);
  const result = spawnSync(process.execPath, [activateScript, candidatePath, activeTrustPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function startVerifier() {
  const child = spawn(process.execPath, [path.join(__dirname, 'fixtures/fossilTrustVerifier.cjs')], {
    env: { ...process.env, GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS_FILE: activeTrustPath,
      GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS: '' }, stdio: ['pipe', 'pipe', 'pipe']
  });
  const output = readline.createInterface({ input: child.stdout });
  const pending = [];
  output.on('line', (line) => {
    const request = pending.shift();
    if (request) request.resolve(JSON.parse(line));
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return { child, pending };
}

function verifyOnInstance(instance, fossil) {
  return new Promise((resolve, reject) => {
    instance.pending.push({ resolve, reject });
    instance.child.stdin.write(`${JSON.stringify({ id: crypto.randomUUID(), fossil })}\n`);
  });
}

async function assertInstances(instances, fossil, expected) {
  const results = await Promise.all(instances.map((instance) => verifyOnInstance(instance, fossil)));
  assert(results.every((result) => result.verified === expected),
    `Both long-lived backend instances must verify=${expected} after trust reload`);
}

function stopVerifier(instance) {
  instance.child.stdin.end();
  return new Promise((resolve) => instance.child.once('exit', resolve));
}

run().catch((error) => {
  console.error('Backend to CLI fossil attestation failure:', error);
  process.exitCode = 1;
});
