'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createFormalResult } = require('../../src/services/formalResultService');
const subjects = require('../../src/services/epistemic/oracleMemorySubject');
const bridge = require('../../src/services/epistemic/verifierRuntimeBridge');
const readGate = require('../../src/services/promotionMemoryReadGate');

function antigen(subject) {
  const producer = { model: 'promotion-memory-compiler', version: '1', actorId: subject.content.source.agentId,
    strategy: 'report-to-memory', workspaceId: subject.binding.workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjects.STATEMENT, status: 'tested', assumptions: [],
    validityDomain: subjects.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:promotion-memory-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: producer.actorId,
      source: { type: 'promotion-memory', uri: `genos://memories/${subject.content.memory.id}`,
        digest: `sha256:${require('../../src/services/trinityProvenanceValues').digest(subject.binding)}` },
      inputs: [], transformations: ['recorded-promotion-to-memory-fidelity'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal, producer,
    epitopes: { evidence: { digest: formal.evidence.digest } } };
}

function options(db, request) { return { db, nativeMemorySubject: request, verifierBudget: { remaining: 2 }, timeoutMs: 10000 }; }
function verifiers() { return ['memory_rendered', 'memory_parsed'].map(strategy => ({ type: 'memory_semantic', strategy: [strategy],
  test: { command: 'node -e process.exit(99)' } })); }

async function qualify(db, input) {
  const row = await db.get('SELECT * FROM genome_decisions WHERE created_by=? AND evidence_status=\'linked\'', input.agentId);
  assert.ok(row, 'real promotion must have produced a linked memory');
  const request = { memoryId: row.id, scope: { organizationId: row.organization_id, projectId: row.project_id } };
  const subject = await subjects.load(db, request);
  assert.equal(subject.content.source.runId, input.runId);
  const proof = antigen(subject);
  const batch = await bridge.executeVerifierWorkers(proof, verifiers(), options(db, request));
  assert.equal(batch.results.length, 2);
  for (const result of batch.results) {
    assert.equal(result.status, 'verified', JSON.stringify(result));
    assert.equal(result.receipt.independent, true);
    assert.equal(result.receipt.executionEvidence[0].postconditions.sourceTruth, 'not_evaluated');
    assert.notEqual(result.receipt.executionEvidence[0].processId, process.pid);
    assert.equal(result.receipt.executionEvidence[0].subject.memoryId, row.id);
  }
  assert.notEqual(batch.results[0].receipt.executionEvidence[0].cwd, batch.results[1].receipt.executionEvidence[0].cwd);
  const registry = require('../../src/services/verifierTrustRegistry');
  const assembly = require('../../src/services/epistemic/aeisPromotionBridge').buildAssuranceAssemblyFromHolobionte([proof],
    [{ immune: { verifierResults: batch } }], { trustedVerifierDigests: registry.listVerifierDigests() });
  assert.equal(require('../../src/services/epistemicAssuranceService').evaluateEpistemicAssurance(assembly).eligible, true);
  assert.equal((await readGate.inspect(db, row)).status, 'verified');
  await bindingRefusals(db, { request, proof });
  await corruptContent(db, { row, request, proof });
  await forgedClaims(db, { row, request });
  const foreign = { ...request, scope: { ...request.scope, projectId: 'foreign-project' } };
  await assert.rejects(subjects.load(db, foreign), { code: 'MEMORY_ORACLE_SCOPE_MISMATCH' });
  await require('./nativeMemoryRetractionProbes').qualify(db, { row, request, subject });
  console.log('Memory oracle: real promoted memory, two fresh processes and signed AEIS fidelity; contradictory content and hash-valid false claims rejected.');
}

async function bindingRefusals(db, input) {
  const declared = structuredClone(input.proof);
  declared.producer.model = 'fabricated-independent-model';
  const denied = await bridge.executeVerifierWorkers(declared, verifiers(), options(db, input.request));
  assert.equal(denied.results.every(item => item.status === 'error' && item.reason === 'MEMORY_ORACLE_PRODUCER_MISMATCH'), true, JSON.stringify(denied));
  const duplicates = await bridge.executeVerifierWorkers(input.proof, [
    { ...verifiers()[0], actorId: 'declared-a', model: 'declared-a' },
    { ...verifiers()[0], actorId: 'declared-b', model: 'declared-b' }
  ], options(db, input.request));
  assert.equal(duplicates.results[0].receipt.independent, true);
  assert.equal(duplicates.results[1].receipt.independent, false);
  const exhausted = await bridge.executeVerifierWorkers(input.proof, verifiers(), { ...options(db, input.request), verifierBudget: { remaining: 0 } });
  assert.equal(exhausted.results.every(item => item.status === 'inconclusive' && !item.receipt), true);
}

async function corruptContent(db, input) {
  const vector = require('../../src/services/vectorMemoryService');
  const searchOptions = { organizationId: input.row.organization_id, projectId: input.row.project_id, limit: 10 };
  const positive = await vector.searchMemory(input.row.content, searchOptions, db);
  assert.ok(positive.allScoredExperiences.some(item => item.id === input.row.id), 'valid source memory is retrievable');
  await db.run('UPDATE genome_decisions SET content=? WHERE id=?', input.row.content + '\nFalse added claim.', input.row.id);
  try {
    assert.equal((await readGate.inspect(db, input.row)).status, 'refuted');
    const result = await vector.searchMemory(input.row.content, searchOptions, db);
    assert.equal(result.allScoredExperiences.some(item => item.id === input.row.id), false, 'contradictory memory never reaches the search result');
    const batch = await bridge.executeVerifierWorkers(input.proof, verifiers(), options(db, input.request));
    assert.equal(batch.results.every(item => item.status === 'error'), true, 'prior evidence subject cannot sign a changed memory');
    const current = antigen(await subjects.load(db, input.request));
    assert.equal((await bridge.executeVerifierWorkers(current, verifiers(), options(db, input.request))).results.every(item => item.status === 'refuted'), true);
  } finally { await db.run('UPDATE genome_decisions SET content=? WHERE id=?', input.row.content, input.row.id); }
}

async function forgedClaims(db, input) {
  const child = await db.get('SELECT * FROM provenance_records WHERE id=?', input.row.provenance_record_id);
  const payload = JSON.parse(child.payload_json);
  payload.claims[0].statement = 'This unrelated conclusion is true.';
  const encoded = JSON.stringify(payload);
  const hash = createHash('sha256').update(encoded).digest('hex');
  await db.run('UPDATE provenance_records SET payload_json=?,payload_hash=? WHERE id=?', encoded, hash, child.id);
  await db.run('UPDATE genome_decisions SET provenance_hash=? WHERE id=?', hash, input.row.id);
  try {
    assert.equal((await readGate.inspect(db, input.row)).status, 'refuted');
    const current = antigen(await subjects.load(db, input.request));
    const batch = await bridge.executeVerifierWorkers(current, verifiers(), options(db, input.request));
    assert.equal(batch.results.every(item => item.status === 'refuted'), true, JSON.stringify(batch));
  } finally {
    await db.run('UPDATE provenance_records SET payload_json=?,payload_hash=? WHERE id=?', child.payload_json, child.payload_hash, child.id);
    await db.run('UPDATE genome_decisions SET provenance_hash=? WHERE id=?', input.row.provenance_hash, input.row.id);
  }
}

module.exports = { qualify };
