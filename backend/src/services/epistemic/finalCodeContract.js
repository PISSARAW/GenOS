'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {resolveContainedPathNoSymlinkSync} = require('../pathSafety');
const contracts = require('./workspaceVerificationContract');

async function fields(mission, root) {
  if (mission.executionMode !== 'orchestrator' || mission.qualityElevation?.profile !== 'code') return {};
  const tests = require('./commonjsTestContract').TESTS;
  const allowed = mission.executionPolicy?.allowedCommands || [];
  if (!tests.every(test => allowed.includes('node ' + test))) return {};
  const names = (await fs.readdir(root)).filter(name => name.endsWith('.cjs') && name !== 'regression.test.cjs');
  const sources = [];
  for (const name of names) {
    const target = resolveContainedPathNoSymlinkSync(root, name, 'final code contract');
    const bytes = await fs.readFile(target);
    if (bytes.length > 32768) throw Error('FINAL_CODE_SOURCE_TOO_LARGE');
    sources.push({path: name, sha256: createHash('sha256').update(bytes).digest('hex'),
      mutable: !name.endsWith('.test.cjs')});
  }
  const contract = contracts.assertContract({version: 1, kind: 'commonjs_public_tests', tests, sources});
  return {workspaceVerificationContract: contract};
}
module.exports = {fields};
