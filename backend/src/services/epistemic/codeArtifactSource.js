'use strict';

const fs = require('node:fs/promises');
const safety = require('../pathSafety');
const values = require('../trinityProvenanceValues');
const contracts = require('./codePostconditionContract');

async function load(input) {
  const relative = contracts.assertInput(input.method);
  const root = safety.resolveWorkspaceRoot(input.workspaceRoot);
  const destination = safety.resolveContainedPathNoSymlinkSync(root, relative);
  const handle = await fs.open(destination, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 4096 || stat.size < 1) throw values.failure('CODE_ORACLE_ARTIFACT_INVALID');
    const buffer = Buffer.alloc(4097);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead < 1 || bytesRead > 4096) throw values.failure('CODE_ORACLE_ARTIFACT_INVALID');
    const bytes = buffer.subarray(0, bytesRead);
    safety.resolveContainedPathNoSymlinkSync(root, relative);
    const current = await fs.stat(destination);
    if (current.ino !== stat.ino || current.dev !== stat.dev || current.size !== bytes.length) throw values.failure('CODE_ORACLE_ARTIFACT_CHANGED');
    const contentHash = values.hashBytes(bytes);
    if (contentHash !== input.method.parameters.expectedContentHash) throw values.failure('CODE_ORACLE_CONTENT_HASH_MISMATCH');
    return { artifact: { path: relative, contentHash, expression: bytes.toString('utf8') },
      contract: contracts.descriptor(), contractHash: contracts.hash() };
  } finally { await handle.close(); }
}

module.exports = { load };
