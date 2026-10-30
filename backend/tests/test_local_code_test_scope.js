'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { executeProposal } = require('../src/services/localCodeWorkerService');
const { assertScope } = require('../src/services/localCodeTestScope');

async function rejectMutation(source, existing = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-test-scope-'));
  try {
    await fs.writeFile(path.join(root, 'answer.js'), 'module.exports = 0;');
    if (existing) await fs.writeFile(path.join(root, 'guard.txt'), 'original');
    await fs.writeFile(path.join(root, 'check_mutation.js'), `const fs = require('node:fs'); ${source}`);
    const proposal = { format: 'genos.file-replacement/v1', patches: [{ path: 'answer.js', content: 'module.exports = 42;' }],
      tests: ['node check_mutation.js'], evidence: 'fixture' };
    await assert.rejects(executeProposal({ workspaceRoot: root, text: JSON.stringify(proposal),
      allowedCommands: proposal.tests, allowedPatchPaths: ['answer.js'] }),
    error => error.code === 'WORKER_TEST_SCOPE_VIOLATION' && error.changedPaths.includes('guard.txt'));
    assert.equal(await fs.readFile(path.join(root, 'answer.js'), 'utf8'), 'module.exports = 0;');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function main() {
  await rejectMutation("fs.writeFileSync('guard.txt', 'modified');");
  await rejectMutation("fs.unlinkSync('guard.txt');");
  await rejectMutation("fs.writeFileSync('guard.txt', 'new');", false);
  const before = [{ path: 'answer.js', hash: 'old', mode: 420 }, { path: 'guard.txt', hash: 'same', mode: 420 }];
  const after = [{ path: 'answer.js', hash: 'new', mode: 420 }, { path: 'guard.txt', hash: 'same', mode: 493 }];
  assert.throws(() => assertScope({ before, after, patches: [{ path: 'answer.js' }] }), { code: 'WORKER_TEST_SCOPE_VIOLATION' });
  assert.throws(() => assertScope({ before: [], after: [{ path: 'guard.txt', hash: 'new', mode: 420 }],
    patches: [{ path: 'answer.js' }] }), { code: 'WORKER_TEST_SCOPE_VIOLATION' });
  assert.doesNotThrow(() => assertScope({ before, after, patches: [{ path: 'answer.js' }, { path: 'guard.txt' }] }));
  console.log('Capsule test writes remain within the approved patch scope: PASS');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
