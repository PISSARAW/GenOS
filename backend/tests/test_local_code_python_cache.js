'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { executeProposal } = require('../src/services/localCodeWorkerService');

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-python-cache-'));
  try {
    await fs.writeFile(path.join(root, 'answer.py'), 'value = 0\n');
    await fs.writeFile(path.join(root, 'test_answer.py'), 'from answer import value\ndef test_value():\n    assert value == 42\n');
    const result = await executeProposal({ workspaceRoot: root, allowedCommands: ['pytest'],
      text: JSON.stringify({ format: 'genos.file-replacement/v1',
        patches: [{ path: 'answer.py', content: 'value = 42\n' }], tests: ['pytest'], evidence: 'fixture' }) });
    assert.equal(result.testStatus, 'passed', JSON.stringify(result.tests));
    assert.deepEqual(result.changedFiles, ['answer.py']);
    await assert.rejects(fs.stat(path.join(root, '__pycache__')), { code: 'ENOENT' });
    await assert.rejects(fs.stat(path.join(root, '.pytest_cache')), { code: 'ENOENT' });
    console.log('Python capsule tests produce no source-tree caches: PASS');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
