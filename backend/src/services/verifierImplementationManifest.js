"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCES = Object.freeze([
  'verifierTrustRegistry.js', 'epistemic/verifierAdapters.js',
  'epistemic/verifierRuntimeBridge.js', 'epistemic/verifierReceiptBuilder.js',
  'epistemicVerifierReceiptService.js', 'sandboxExecutor.js',
  'sandboxCommandPolicy.js', 'epistemicScheduler/independencePolicy.js',
  'gvxVerifierRegistry.js', 'gvxVerifierControlPlaneRegistry.js',
]);
function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function implementationManifest() {
  return { schema: 'genos.verifier-implementation/v1', node: process.version,
    sources: SOURCES.map((name) => ({ path: name, sha256: digest(fs.readFileSync(path.join(__dirname, name))) })) };
}
module.exports = { implementationManifest, digest };
