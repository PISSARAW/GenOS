'use strict';

// This gate inventories an external scheduler and validates an operator receipt.
// It deliberately does not claim a Kubernetes/cloud observation when no receipt
// exists. Applying the manifest remains an explicit operator action.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'deploy', 'kubernetes', 'morphogenesis-parity.yaml');
const CONTRACT = 'genos-morphogenesis-parity-v1';
const REQUIRED_RECEIPT = ['target', 'runId', 'contract', 'healthChecks', 'parityDigest', 'restartObserved'];

function commandAvailable(command) {
  const probe = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(probe, [command], { encoding: 'utf8', windowsHide: true });
  return result.status === 0;
}

function readReceipt(filename) {
  if (!filename) return null;
  const contents = fs.readFileSync(path.resolve(filename), 'utf8');
  return JSON.parse(contents);
}

function validateReceipt(receipt) {
  if (!receipt) return { valid: false, missing: ['operator receipt'] };
  const missing = REQUIRED_RECEIPT.filter((field) => receipt?.[field] === undefined);
  if (missing.length) return { valid: false, missing };
  const healthy = receipt.healthChecks === true || (Array.isArray(receipt.healthChecks) && receipt.healthChecks.length > 0);
  const valid = receipt.contract === CONTRACT && typeof receipt.parityDigest === 'string' && receipt.parityDigest.length === 64 && healthy && receipt.restartObserved === true;
  return { valid, missing: valid ? [] : ['contract, healthChecks, parityDigest or restartObserved'] };
}

function report() {
  assertManifest();
  const tools = { kubectl: commandAvailable('kubectl'), docker: commandAvailable('docker'), kind: commandAvailable('kind'), minikube: commandAvailable('minikube') };
  const receiptPath = process.env.GENOS_EXTERNAL_DEPLOYMENT_RECEIPT;
  const receipt = readReceipt(receiptPath);
  const validation = receipt ? validateReceipt(receipt) : { valid: false, missing: ['operator receipt'] };
  return {
    contract: CONTRACT,
    manifest: path.relative(ROOT, MANIFEST),
    tools,
    status: validation.valid ? 'observed' : 'not_observed',
    claimable: validation.valid,
    missing: validation.missing,
    applyCommand: 'kubectl apply -f deploy/kubernetes/morphogenesis-parity.yaml'
  };
}

function assertManifest() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`Missing external deployment manifest: ${MANIFEST}`);
  const source = fs.readFileSync(MANIFEST, 'utf8');
  for (const marker of ['StatefulSet', 'replicas: 3', '/readyz', '/healthz', CONTRACT]) {
    if (!source.includes(marker)) throw new Error(`Manifest is missing required marker: ${marker}`);
  }
}

if (require.main === module) {
  try {
    const result = report();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { CONTRACT, MANIFEST, commandAvailable, validateReceipt, report };
