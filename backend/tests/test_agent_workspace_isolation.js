const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createIsolatedWorkspace } = require('../src/services/agentRuntimeAdapter');
const { estimateCopyBytes } = require('../src/services/agentWorkspaceLifecycle/copy');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-isolation-'));
  const capsuleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-capsules-'));
  let outside;
  const previousCapsuleRoot = process.env.GENOS_CAPSULE_ROOT;
  process.env.GENOS_CAPSULE_ROOT = capsuleRoot;
  try {
    fs.writeFileSync(path.join(root, 'mission.txt'), 'parent evidence');
    fs.writeFileSync(path.join(root, '.env'), 'SECRET=must not copy');
    fs.writeFileSync(path.join(root, 'credentials.pem'), 'private key material');
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'config'), 'not copied');
    fs.mkdirSync(path.join(root, 'target'));
    fs.writeFileSync(path.join(root, 'target', 'artifact'), 'not copied');
    fs.mkdirSync(path.join(root, 'target-audit'));
    fs.writeFileSync(path.join(root, 'target-audit', 'artifact'), 'not copied');
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'must not copy');
    try { fs.symlinkSync(outside, path.join(root, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir'); } catch (_) {}
    assert.equal(await estimateCopyBytes(root), Buffer.byteLength('parent evidence'));
    const capsule = await createIsolatedWorkspace(root, 'worker-a');
    assert.strictEqual(fs.readFileSync(path.join(capsule, 'mission.txt'), 'utf8'), 'parent evidence');
    assert.strictEqual(fs.existsSync(path.join(capsule, '.git')), false);
    assert.strictEqual(fs.existsSync(path.join(capsule, 'target')), false);
    assert.strictEqual(fs.existsSync(path.join(capsule, 'target-audit')), false);
    assert.strictEqual(fs.existsSync(path.join(capsule, '.env')), false);
    assert.strictEqual(fs.existsSync(path.join(capsule, 'credentials.pem')), false);
    assert.strictEqual(fs.existsSync(path.join(capsule, 'linked-outside')), false);
    fs.writeFileSync(path.join(capsule, 'mission.txt'), 'worker evidence');
    assert.strictEqual(fs.readFileSync(path.join(root, 'mission.txt'), 'utf8'), 'parent evidence');

    const orchestratorRoot = path.join(capsuleRoot, 'mission');
    fs.mkdirSync(orchestratorRoot, { recursive: true });
    fs.writeFileSync(path.join(orchestratorRoot, 'mission.txt'), 'dynamic programming');
    const worker = await createIsolatedWorkspace(orchestratorRoot, 'worker-b', capsuleRoot);
    assert.strictEqual(worker, path.join(capsuleRoot, 'worker-b'));
    assert.strictEqual(fs.readFileSync(path.join(worker, 'mission.txt'), 'utf8'), 'dynamic programming');
    assert.strictEqual(worker.startsWith(`${orchestratorRoot}${path.sep}`), false);

    const directRoot = path.join(root, 'direct');
    fs.mkdirSync(directRoot);
    fs.writeFileSync(path.join(directRoot, 'mission.txt'), 'direct workspace');
    const directWorker = await createIsolatedWorkspace(directRoot, 'worker-direct', directRoot);
    assert.strictEqual(directWorker, path.join(directRoot, '.genos-agent-worlds', 'worker-direct'));
    assert.strictEqual(fs.readFileSync(path.join(directWorker, 'mission.txt'), 'utf8'), 'direct workspace');

    const nestedSource = path.join(capsuleRoot, 'parent-capsule');
    fs.mkdirSync(nestedSource, { recursive: true });
    fs.writeFileSync(path.join(nestedSource, 'mission.txt'), 'delegated workspace');
    const nestedWorker = await createIsolatedWorkspace(nestedSource, 'worker-nested');
    assert.strictEqual(nestedWorker, path.join(capsuleRoot, 'worker-nested'));
    assert.strictEqual(fs.readFileSync(path.join(nestedWorker, 'mission.txt'), 'utf8'), 'delegated workspace');
    assert.strictEqual(fs.existsSync(path.join(nestedSource, 'worker-nested')), false,
      'nested capsule creation must not recurse into the source workspace');

    const repository = path.join(root, 'repository');
    const nestedMission = path.join(repository, 'task');
    fs.mkdirSync(nestedMission, { recursive: true });
    fs.writeFileSync(path.join(repository, 'repo-only.txt'), 'must not escape into the mission');
    fs.writeFileSync(path.join(nestedMission, 'task-only.txt'), 'bounded mission');
    assert.strictEqual(spawnSync('git', ['init', '--quiet'], { cwd: repository }).status, 0);
    const nestedCapsule = await createIsolatedWorkspace(nestedMission, 'worker-c', capsuleRoot);
    assert.strictEqual(fs.readFileSync(path.join(nestedCapsule, 'task-only.txt'), 'utf8'), 'bounded mission');
    assert.strictEqual(fs.existsSync(path.join(nestedCapsule, 'repo-only.txt')), false);

    const gitRoot = path.join(root, 'git-workspace');
    fs.mkdirSync(gitRoot);
    fs.writeFileSync(path.join(gitRoot, 'tracked.txt'), 'tracked');
    assert.strictEqual(spawnSync('git', ['init', '--quiet'], { cwd: gitRoot }).status, 0);
    assert.strictEqual(spawnSync('git', ['add', 'tracked.txt'], { cwd: gitRoot }).status, 0);
    assert.strictEqual(spawnSync('git', ['-c', 'user.name=GenOS Test', '-c', 'user.email=test@genos.local',
      'commit', '--quiet', '-m', 'test'], { cwd: gitRoot }).status, 0);
    fs.writeFileSync(path.join(gitRoot, 'untracked.txt'), 'copy me');
    fs.mkdirSync(path.join(gitRoot, 'target-audit'));
    fs.writeFileSync(path.join(gitRoot, 'target-audit', 'artifact'), 'do not copy');
    const gitCapsule = await createIsolatedWorkspace(gitRoot, 'worker-git', capsuleRoot);
    assert.strictEqual(fs.readFileSync(path.join(gitCapsule, 'untracked.txt'), 'utf8'), 'copy me');
    assert.strictEqual(fs.existsSync(path.join(gitCapsule, 'target-audit')), false);
    console.log('Agent workspace isolation checks passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(capsuleRoot, { recursive: true, force: true });
    if (outside) fs.rmSync(outside, { recursive: true, force: true });
    if (previousCapsuleRoot === undefined) delete process.env.GENOS_CAPSULE_ROOT;
    else process.env.GENOS_CAPSULE_ROOT = previousCapsuleRoot;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
