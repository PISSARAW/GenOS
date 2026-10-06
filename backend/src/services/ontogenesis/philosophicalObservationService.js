'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const { assertContainedFiles } = require('./pathAuthority');
const { OBSERVATION_FILE, contractsFor, requiredReferences } = require('./philosophicalMissionContract');
const { executeSelection } = require('../../philosophy/contractRuntime');
const { digest, contractFingerprint } = require('../../philosophy/contractFingerprint');
const MAX_BYTES = 128 * 1024;
const FORBIDDEN = /(^|\/)(\.env[^/]*|\.git|node_modules|target|dist)(\/|$)|\.(db|sqlite|pem|key)$/i;

function readBounded(root, relative) {
  const [absolute] = assertContainedFiles(root, [relative]);
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('observation-philosophique-trop-grande');
  const content = fs.readFileSync(absolute);
  if (content.length > MAX_BYTES) throw new Error('observation-philosophique-trop-grande');
  return { value: JSON.parse(content.toString('utf8')), hash: crypto.createHash('sha256').update(content).digest('hex') };
}

function pointerSegments(pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.length > 512) throw new Error('pointeur-observation-invalide');
  if (/~(?![01])/u.test(pointer)) throw new Error('echappement-pointeur-invalide');
  const segments = pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (segments.length > 16) throw new Error('pointeur-observation-trop-profond');
  return segments;
}

function pointerValue(value, pointer) {
  let current = value;
  for (const segment of pointerSegments(pointer)) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) throw new Error('observation-source-absente');
    current = current[segment];
  }
  return current;
}

function bindingValue(root, binding, cache) {
  if (!binding || typeof binding.file !== 'string') throw new Error('liaison-observation-requise');
  const file = binding.file.replace(/\\/g, '/');
  if (FORBIDDEN.test(file) || !file.endsWith('.json')) throw new Error('source-observation-interdite');
  if (!cache.has(file) && cache.size >= 32) throw new Error('budget-sources-philosophiques-depasse');
  if (!cache.has(file)) cache.set(file, readBounded(root, file));
  return pointerValue(cache.get(file).value, binding.pointer);
}

function collectObservations(root, artifact, contracts) {
  const observations = {};
  const cache = new Map();
  for (const contract of contracts) {
    if (artifact.contractHashes?.[contract.id] !== contractFingerprint(contract)) throw new Error('empreinte-contrat-obsolete');
    const field = contract.execution.field;
    observations[field] = bindingValue(root, artifact.bindings?.[field], cache);
  }
  return { observations, sources: [...cache].map(([file, source]) => ({ file, hash: source.hash })) };
}

function verifyPhilosophicalObservations(root, references, binding = {}) {
  const contracts = contractsFor(requiredReferences(references));
  if (!contracts.length) return null;
  const artifact = readBounded(binding.artifactRoot || root, OBSERVATION_FILE);
  if (!binding.missionId || artifact.value.missionId !== binding.missionId) throw new Error('observation-autre-mission');
  const { observations, sources } = collectObservations(root, artifact.value, contracts);
  const runtime = executeSelection(contracts, { observations });
  const rejected = runtime.executions.filter((item) => item.assessment.status !== 'satisfied');
  if (rejected.length) throw new Error(`audit-philosophique-rejete:${rejected.map((item) => item.contractId).join(',')}`);
  const payload = { kind: 'runtime-receipt', scope: 'bounded-software-audit',
    missionId: binding.missionId, treeHash: binding.treeHash || null, artifactHash: artifact.hash,
    contracts: runtime.executions.map(({ contractId, contractHash, inputHash, after }) =>
      ({ contractId, contractHash, inputHash, stateHash: digest(after) })), sources,
    sourceFactsVerified: false, independentValidation: false, promotionEligible: false };
  return { ...payload, receiptHash: digest(payload) };
}
module.exports = { verifyPhilosophicalObservations, pointerValue, readBounded };
