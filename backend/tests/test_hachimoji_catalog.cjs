'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../src/services/agentDna/hachimojiCatalog');
const qualification = require('../src/services/agentDna/hachimojiQualification');

function run() {
  const file = process.env.GENOS_HACHIMOJI_RECEIPT || path.join(catalog.root, catalog.receiptPath);
  const receipt = JSON.parse(fs.readFileSync(file));
  assert.equal(receipt.receiptHash, qualification.receiptDigest(receipt), 'Receipt integrity');
  assert.equal(receipt.sourceFingerprint, catalog.sourceFingerprint(), 'Qualification source drift');
  const directory = process.env.GENOS_HACHIMOJI_CATALOG_DIR || catalog.root;
  const result = catalog.verifyCatalog(receipt, directory);
  const local = receipt.entries.find(entry => entry.name === 'LocalCodeWorker');
  assert.equal(local.kind, 'transcode');
  assert.notEqual(local.sourceContentHash, local.targetContentHash);
  assert.ok(receipt.entries.some(entry => entry.role === 'resident_daemon'));
  assert.ok(receipt.entries.some(entry => entry.role === 'host_orchestrator'));
  console.log(`Hachimoji catalog: ${result.qualified}/${receipt.entries.length} qualified; Rust/Node parity, complete inventory, exact instructions and regulation preserved; no promotion authorized.`);
}

try { run(); } catch (error) { console.error(error); process.exitCode = 1; }
