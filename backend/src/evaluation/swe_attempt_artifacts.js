'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function safeTaskId(value) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_');
}

function appendAttemptArtifact(attempt) {
  const root = process.env.GENOS_SWE_ARTIFACT_DIR;
  if (!root) return false;
  fs.mkdirSync(root, { recursive: true });
  const artifact = { schema: 'genos.swe.attempt/v1', recordedAt: new Date().toISOString(), ...attempt };
  const filePath = path.join(root, `${safeTaskId(attempt.instanceId)}.attempts.jsonl`);
  fs.appendFileSync(filePath, `${JSON.stringify(artifact)}\n`, 'utf8');
  return true;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

module.exports = { appendAttemptArtifact, sha256 };
