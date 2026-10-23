'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveAdapter } = require('../bin/run-field-campaign-orchestrator.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-field-adapter-lock-'));
try {
  const campaignDir = path.join(root, 'campaign');
  fs.mkdirSync(campaignDir);
  const lockedAdapter = path.join(root, 'locked-adapter.cjs');
  const otherAdapter = path.join(root, 'synthetic-adapter.cjs');
  fs.writeFileSync(lockedAdapter, 'module.exports = {};\n');
  fs.writeFileSync(otherAdapter, 'module.exports = {};\n');
  fs.writeFileSync(path.join(campaignDir, 'seal.json'), JSON.stringify({
    manifest: { mode: 'field' }, adapter: { path: lockedAdapter,
      sha256: 'sealed-adapter-digest' }
  }));

  assert.equal(resolveAdapter(campaignDir), lockedAdapter);
  assert.equal(resolveAdapter(campaignDir, lockedAdapter), lockedAdapter);
  assert.throws(() => resolveAdapter(campaignDir, otherAdapter), /differs from the sealed/);
  fs.writeFileSync(path.join(campaignDir, 'seal.json'), JSON.stringify({
    manifest: { mode: 'field' }, adapter: { path: 'relative-adapter.cjs' }
  }));
  assert.throws(() => resolveAdapter(campaignDir), /absolute adapter lock/);
  console.log('Field campaign runner uses only the adapter path sealed into the campaign.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
