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

function normalizedDigest(value) {
  return String(value || '').replace(/^sha256:/, '');
}

function taskIdentifier(task) {
  return task.id ? task.id : task.taskId;
}

function loadExternalOracle(task, datasetFile, trainingOracleIds) {
  const taskId = taskIdentifier(task);
  if (!task.oracleId || pilotOracleIds.has(task.oracleId) || trainingOracleIds.includes(task.oracleId)) {
    throw new Error(`Confirmatory oracle must have a new, independently identified oracleId: ${taskId}`);
  }
  const file = path.resolve(path.dirname(datasetFile), task.oracleModule || '');
  if (!file.startsWith(`${oracleRoot}${path.sep}`) || !fs.existsSync(file)) {
    throw new Error(`Oracle module must be present under holdout-oracles: ${taskId}`);
  }
  const sha256 = fileDigest(file);
  if (sha256 !== normalizedDigest(task.oracleSha256)) throw new Error(`Oracle module hash mismatch: ${taskId}`);
  const loaded = require(file);
  const verify = loaded.verifyCandidate || loaded.verify;
  if (typeof verify !== 'function') throw new Error(`Oracle module must export verify(candidate): ${taskId}`);
  return { verify, oracleId: task.oracleId, sha256 };
}

module.exports = { loadExternalOracle };
