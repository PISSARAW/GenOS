'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assembler = require('../src/services/trinityArtifactAssembler');
const { hashWorkspace } = require('../src/services/trinitySnapshotService');

async function testAssembly() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trinity-assembly-'));
  try {
    const source = path.join(root, 'source'), target = path.join(root, 'target');
    await fs.mkdir(source); await fs.mkdir(target);
    const content = 'module.exports = 42;\n';
    await fs.writeFile(path.join(source, 'answer.js'), content);
    const sourceHash = await hashWorkspace(source);
    const worlds = [{ worldNumber: 1, agentId: 'source' }];
    const plan = { baseWorld: 1, files: [{ worldNumber: 1, path: 'answer.js',
      sha256: crypto.createHash('sha256').update(content).digest('hex') }] };
    const db = { get: async () => ({ workspace_root: source }) };
    const receipt = await assembler.assemble(db, { candidate: target, plan, worlds });
    assert.equal(await fs.readFile(path.join(target, 'answer.js'), 'utf8'), content);
    assert.equal(await hashWorkspace(source), sourceHash);
    assert.equal(receipt.contentHash, await hashWorkspace(target));
    await testPromotionIntegrity({ target, content, receipt });
    await assert.rejects(assembler.assemble(db, { candidate: target, worlds,
      plan: { ...plan, files: [{ ...plan.files[0], sha256: '0'.repeat(64) }] } }), /hash_mismatch/);
    for (const unsafe of ['../escape.js', 'C:/escape.js', '.env', 'node_modules/code.js']) {
      assert.throws(() => assembler.validatePlan({ ...plan, files: [{ ...plan.files[0], path: unsafe }] }, worlds));
    }
    assert.throws(() => assembler.validatePlan({ ...plan, files: [...plan.files, ...plan.files] }, worlds), /conflicting/);
    await fs.writeFile(path.join(source, '.genos-epoch'), 'runtime-a');
    assert.equal(await hashWorkspace(source), sourceHash);
    await fs.writeFile(path.join(source, '.genos-epoch'), 'runtime-b');
    assert.equal(await hashWorkspace(source), sourceHash);
  } finally {
    const verifiedRoot = path.resolve(root);
    assert.equal(path.dirname(verifiedRoot), path.resolve(os.tmpdir()));
    await fs.rm(verifiedRoot, { recursive: true, force: true });
  }
}

async function testPromotionIntegrity(context) {
  const { target, content, receipt } = context;
  const integrity = require('../src/services/trinityPromotionIntegrity');
  const git = require('../src/services/agentGitService');
  const metadata = { contentHash: receipt.contentHash };
  const object = { id: 'signed-fixture', commit_hash: 'fixture-commit', metadata_json: JSON.stringify(metadata),
    signature: git.signObject('fixture-commit', metadata) };
  const decision = { artifact: { targetWorkspace: target }, verification: metadata, agentGit: { objectId: object.id } };
  const db = { get: async sql => sql.includes('agent_git_objects') ? object
    : { status: 'promoted', decision_json: JSON.stringify(decision) } };
  assert.equal((await integrity.previousPromotion({ db, missionId: 'fixture' })).promoted, true);
  await fs.writeFile(path.join(target, 'answer.js'), 'modified after promotion');
  const changed = await integrity.previousPromotion({ db, missionId: 'fixture' });
  assert.equal(changed.promoted, false);
  assert.equal(changed.reason, 'TRINITY_CANDIDATE_HASH_CHANGED');
  await fs.writeFile(path.join(target, 'answer.js'), content);
  object.signature = 'tampered';
  const unsigned = await integrity.previousPromotion({ db, missionId: 'fixture' });
  assert.equal(unsigned.promoted, false);
  assert.equal(unsigned.reason, 'TRINITY_PROMOTION_SIGNATURE_INVALID');
}

testAssembly().then(() => console.log('Trinity composite assembly confinement, hashes and metadata: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
