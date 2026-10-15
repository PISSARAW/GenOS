'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const benchmarkRoot = path.resolve(__dirname);
const oracleRoot = path.join(benchmarkRoot, 'holdout-oracles');
const pilotOracleIds = new Set(Object.keys(require('./oracles.cjs').ORACLES || {}));

function fileDigest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function loadExternalOracle(task, datasetFile, trainingOracleIds) {
  if (!task.oracleId || pilotOracleIds.has(task.oracleId) || trainingOracleIds.includes(task.oracleId)) {
    throw new Error(`Confirmatory oracle must have a new, independently identified oracleId: ${task.id}`);
  }
  const file = path.resolve(path.dirname(datasetFile), task.oracleModule || '');
  if (!file.startsWith(`${oracleRoot}${path.sep}`) || !fs.existsSync(file)) {
    throw new Error(`Oracle module must be present under holdout-oracles: ${task.id}`);
  }
  const sha256 = fileDigest(file);
  if (sha256 !== task.oracleSha256) throw new Error(`Oracle module hash mismatch: ${task.id}`);
  const loaded = require(file);
  const verify = loaded.verifyCandidate || loaded.verify;
  if (typeof verify !== 'function') throw new Error(`Oracle module must export verify(candidate): ${task.id}`);
  return { verify, oracleId: task.oracleId, sha256 };
}

module.exports = { loadExternalOracle };
