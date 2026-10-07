'use strict';

const fs = require('node:fs').promises;
const path = require('node:path');
const integrity = require('./trinityCapsuleSnapshot');
const { exists } = require('./workspaceSnapshotPaths');

const RETRY_DELAYS_MS = Object.freeze([25, 50, 100, 200, 400]);

function busy(error) {
  return ['EPERM', 'EBUSY', 'EEXIST', 'ENOTEMPTY'].includes(error?.code);
}

async function existingPayload(spec) {
  if (!await exists(path.join(spec.target, 'manifest.json'))) return false;
  await integrity.verify(spec.root, spec.hash);
  await fs.rm(spec.staging, { recursive: true, force: true });
  return true;
}

async function publish(spec) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(spec.staging, spec.target);
      await integrity.verify(spec.root, spec.hash);
      return;
    } catch (error) {
      if (!busy(error)) throw error;
      if (await existingPayload(spec)) return;
      if (attempt === RETRY_DELAYS_MS.length) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

module.exports = { publish, RETRY_DELAYS_MS };
