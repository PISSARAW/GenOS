'use strict';
const fs = require('node:fs');
const safety = require('./pathSafety');
const values = require('./trinityProvenanceValues');
const contracts = require('./codeBoundaryContract');
const branded = new WeakMap();

function fail(code) { throw values.failure(`Q7_BOUNDARY_${code}`); }
function file(root, relative) {
  const resolved = safety.resolveContainedPathNoSymlinkSync(root, relative, 'boundary evidence');
  const bytes = fs.readFileSync(resolved);
  if (!bytes.length || bytes.length > 200000) fail('TEST_MISSING');
  return { path: relative, hash: values.hashBytes(bytes) };
}
function body(proof) { const { witnessHash, ...result } = proof; return result; }
function mint(payload) {
  const proof = { ...payload, witnessHash: values.digest(payload) };
  branded.set(proof, proof.witnessHash);
  return proof;
}
function authentic(proof) {
  return Boolean(proof && branded.get(proof) === proof.witnessHash
    && values.digest(body(proof)) === proof.witnessHash);
}
function admit(mission, proposal) {
  const contract = contracts.read(mission);
  if (!contract) return null;
  const proof = proposal?.boundaryEvidence;
  if (!authentic(proof)) fail('WITNESS_UNTRUSTED');
  if (proof.contractHash !== values.digest(contract) || proof.scope.agentId !== mission.agentId
    || proof.scope.missionId !== (mission.missionId || mission.mission_id || mission.id)) fail('SOURCE_CHANGED');
  const expected = [...proof.sources.map(source => ({ path: source.path, hash: source.candidateHash })),
    proof.generatedTest, ...proof.visibleTests, { path: '.genos/boundary-check.cjs', hash: proof.runner.hash },
    { path: '.genos/boundary-contract.json', hash: values.hashBytes(Buffer.from(JSON.stringify(contract))) }];
  for (const item of expected) if (file(mission.workspaceRoot, item.path).hash !== item.hash) fail('SOURCE_CHANGED');
  return proof;
}
function references(proposal) {
  const proof = proposal?.boundaryEvidence;
  return authentic(proof) ? [`genos://code-boundary/${proof.witnessHash}`,
    `genos://code-test-execution/${proof.receiptRefs.baseline}`] : [];
}
module.exports = { admit, mint, authentic, references, fail, file };
