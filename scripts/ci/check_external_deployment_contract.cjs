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
const RECEIPT_SCHEMA = 'genos-morphogenesis-external-receipt-v1';
const REQUIRED_RECEIPT = ['schemaVersion', 'target', 'runId', 'contract', 'context', 'namespace', 'imageDigest', 'podIdentities', 'healthChecks', 'parityDigest', 'restartObserved', 'evidenceRefs'];

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

function requiredFields(receipt) {
  return REQUIRED_RECEIPT.filter((field) => receipt?.[field] === undefined);
}

function healthChecksValid(checks) {
  if (!Array.isArray(checks)) return false;
  return ['/readyz', '/healthz'].every((pathName) => checks.some((check) => check?.path === pathName && check.status === 200 && check.observedAt));
}

function podIdentitiesValid(podIdentities) {
  if (!Array.isArray(podIdentities) || podIdentities.length < 3) return false;
  const uniquePods = new Set(podIdentities.map((pod) => pod?.uid));
  return uniquePods.size === podIdentities.length && podIdentities.every((pod) => pod?.name && pod?.uid && pod.ready === true);
}

function restartEvidenceValid(restartObserved, parityDigest) {
  return restartObserved && restartObserved.beforePodUid && restartObserved.afterPodUid
    && restartObserved.beforePodUid !== restartObserved.afterPodUid && restartObserved.recoveredDigest === parityDigest;
}

function digestsValid(imageDigest, parityDigest) {
  return /^sha256:[0-9a-f]{64}$/i.test(imageDigest) && /^[0-9a-f]{64}$/i.test(parityDigest);
}

function receiptMetadataValid(receipt) {
  return receipt.schemaVersion === RECEIPT_SCHEMA && ['kubernetes', 'cloud'].includes(receipt.target)
    && receipt.contract === CONTRACT && receipt.context && receipt.namespace;
}

function receiptEvidenceValid(receipt) {
  return podIdentitiesValid(receipt.podIdentities) && healthChecksValid(receipt.healthChecks)
    && digestsValid(receipt.imageDigest, receipt.parityDigest)
    && restartEvidenceValid(receipt.restartObserved, receipt.parityDigest)
    && Array.isArray(receipt.evidenceRefs) && receipt.evidenceRefs.length > 0;
}

function receiptClaimsValid(receipt) {
  return receiptMetadataValid(receipt) && receiptEvidenceValid(receipt);
}

function validateReceipt(receipt) {
  if (!receipt) return { valid: false, missing: ['operator receipt'] };
  const missing = requiredFields(receipt);
  if (missing.length) return { valid: false, missing };
  const valid = receiptClaimsValid(receipt);
  return { valid, missing: valid ? [] : ['schema, target, context, pod identities, healthchecks, digests, restart evidence or evidence references'] };
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

module.exports = { CONTRACT, MANIFEST, RECEIPT_SCHEMA, commandAvailable, validateReceipt, report };
