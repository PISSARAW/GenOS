'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const corpus = require('../competence-five-arms/corpus.cjs');
const protocol = require('./protocol.json');
const root = path.resolve(__dirname, '../..');
const fileHash = filename => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

const fingerprint = value => corpus.hash(canonical(value));

function verifySources(runtimeRoot = root) {
  const manifest = JSON.parse(fs.readFileSync(runtimeRoot + '/runtime-source-manifest.json', 'utf8'));
  if (manifest.sourceHashEncoding !== 'sorted-compact-utf8-json/v1'
    || fingerprint(manifest.sources) !== manifest.sourcesHash) throw Error('SOURCE_MANIFEST_HASH_MISMATCH');
  if (!['target/debug/genos.exe', 'target/debug/genos-mcp.exe'].every(name => manifest.binaries?.[name])) {
    throw Error('SEALED_NATIVE_BINARIES_REQUIRED');
  }
  if (fingerprint({sourcesHash: manifest.sourcesHash, binaries: manifest.binaries, nodeHash: manifest.nodeHash})
    !== manifest.runtimeHash) throw Error('RUNTIME_SEAL_MISMATCH');
  if (fileHash(process.execPath) !== manifest.nodeHash) throw Error('NODE_EXECUTABLE_CHANGED');
  for (const [name, hash] of Object.entries({...manifest.sources, ...manifest.binaries})) {
    if (fileHash(path.join(runtimeRoot, name)) !== hash) throw Error('RUNTIME_CHANGED: ' + name);
  }
  return manifest;
}

function verifyControl(directory, expectedHash) {
  const manifest = JSON.parse(fs.readFileSync(directory + '/manifest.json', 'utf8'));
  const result = JSON.parse(fs.readFileSync(directory + '/control-result.json', 'utf8'));
  if (corpus.hash(manifest) !== expectedHash || result.manifestHash !== expectedHash) throw Error('CONTROL_SEAL_MISMATCH');
  if (!result.passed || !result.rows.every(row => row.correct)) throw Error('PASSING_INDUCTION_CONTROL_REQUIRED');
  const runtime = verifySources();
  if (manifest.runtimeSourceHash !== runtime.sourcesHash) throw Error('CONTROL_RUNTIME_MISMATCH');
  if (manifest.runtimeHash !== runtime.runtimeHash) throw Error('CONTROL_BINARY_RUNTIME_MISMATCH');
  if (manifest.model.digest !== protocol.modelDigest) throw Error('CONTROL_MODEL_MISMATCH');
  return {directory, manifestHash: expectedHash, runtimeSourceHash: runtime.sourcesHash,
    runtimeHash: runtime.runtimeHash, model: manifest.model};
}

module.exports = {root, fileHash, fingerprint, verifySources, verifyControl};
