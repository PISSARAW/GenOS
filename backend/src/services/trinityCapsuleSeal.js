const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const paths = require('./trinityCapsulePaths');
const store = require('./trinityCapsuleSealStore');

function specification(context, resolved) {
  return { correlation: resolved.correlation, workspaceRoot: path.resolve(context.workspaceRoot),
    sourceSnapshotHash: context.sourceSnapshotHash || null, name: context.name || 'worker',
    role: context.role || 'worker', budgetSteps: context.budgetSteps || 100,
    executable: context.executable || null, fallbackAllowed: context.fallbackSynthetic === true };
}

async function fileHash(file) {
  paths.assertPath(file);
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function verify(capsule) {
  const root = paths.assertPath(capsule.root);
  const seal = JSON.parse(await fs.readFile(paths.assertPath(path.join(root, 'capsule-seal.json')), 'utf8'));
  if (seal.schema !== 'trinity.capsule/v1') paths.fail('Unsupported capsule seal.');
  if (paths.hash(seal.payload) !== seal.hash) paths.fail('Capsule seal was altered.');
  if (capsule.sealHash !== seal.hash) paths.fail('Capsule anchored seal hash mismatch.');
  const stored = seal.payload.capsule;
  if (stored.root !== root) paths.fail('Capsule root mismatch.');
  for (const key of Object.keys(seal.payload.files)) {
    paths.contained(root, stored[key]);
    if (await fileHash(stored[key]) !== seal.payload.files[key]) paths.fail(`Capsule ${key} was altered.`);
  }
  const { sealHash, ...descriptor } = capsule;
  if (paths.hash(stored) !== paths.hash(descriptor)) paths.fail('Capsule descriptor mismatch.');
  return seal;
}

async function read(context, resolved) {
  if (!resolved.correlation) return null;
  const target = paths.assertPath(path.join(resolved.root, 'capsule-seal.json'));
  let seal;
  try { seal = JSON.parse(await fs.readFile(target, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const capsule = { ...seal.payload.capsule, sealHash: seal.hash };
  await store.assertStored(context, capsule);
  await verify(capsule);
  if (paths.hash(specification(context, resolved)) !== seal.payload.specHash) paths.fail('Capsule reprise inputs changed.');
  return capsule;
}

async function write(context, resolved, capsule) {
  if (!resolved.correlation) return capsule;
  const sealedCapsule = { ...capsule, worldId: resolved.correlation.worldId, correlation: resolved.correlation, bootstrapMode: context.bootstrapMode || 'native',
    fallbackReason: context.fallbackReason || null, sealPath: path.join(resolved.root, 'capsule-seal.json') };
  const files = { genomePath: await fileHash(capsule.genomePath), snapshotPath: await fileHash(capsule.snapshotPath) };
  if (capsule.capsulePath) files.capsulePath = await fileHash(capsule.capsulePath);
  const payload = { specHash: paths.hash(specification(context, resolved)), sourceSnapshotHash: context.sourceSnapshotHash || null,
    capsule: sealedCapsule, files };
  const seal = { schema: 'trinity.capsule/v1', payload, hash: paths.hash(payload) };
  await fs.writeFile(sealedCapsule.sealPath, JSON.stringify(seal), { flag: 'wx', mode: 0o600 });
  const result = { ...sealedCapsule, sealHash: seal.hash };
  await store.persist(context, result);
  return result;
}

async function provision(context, operation) {
  const resolved = require('./agentCapsuleGate').resolveCapsulePaths(context);
  const prior = await read(context, resolved);
  if (prior) return prior;
  paths.ensureDirectory(path.dirname(resolved.root));
  const lock = paths.assertPath(resolved.root + '.lock');
  await fs.mkdir(lock);
  try {
    const concurrent = await read(context, resolved);
    if (concurrent) return concurrent;
    try { await fs.lstat(resolved.root); paths.fail('Unsealed capsule exists; explicit recovery required.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return await write(context, resolved, await operation());
  } finally { await fs.rmdir(lock); }
}

module.exports = { read, write, verify, provision };
