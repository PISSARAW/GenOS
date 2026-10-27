'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createHash } = require('node:crypto');

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function verifyInChild(expected, proposal) {
  const worker = path.join(__dirname, 'oracle_worker.js');
  const result = spawnSync(process.execPath, [worker], {
    input: JSON.stringify([{ expected, proposal }]), encoding: 'utf8', timeout: 5000
  });
  if (result.status !== 0) throw new Error(`Independent oracle failed: ${result.stderr || result.error}`);
  const [verification] = JSON.parse(result.stdout);
  return { ...verification, submittedAnswerId: proposal?.answerId || null,
    oracleDigest: digest({ expected, verdict: verification.verdict }) };
}

module.exports = { verifyInChild };
