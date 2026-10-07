'use strict';

const values = require('../trinityProvenanceValues');
const { createHash } = require('node:crypto');
const { withTransaction } = require('../../db');
const STATEMENT = 'La mémoire reproduit fidèlement le rapport de promotion enregistré.';
const DOMAIN = { statement: 'Copie textuelle des mémoires Experience issues de promotions.',
  constraints: ['Le texte et les claims correspondent au rapport source.', 'La provenance appartient au run et au tenant enregistrés.'] };

function verifiedPayload(record) {
  if (!record || createHash('sha256').update(record.payload_json).digest('hex') !== record.payload_hash) {
    throw values.failure('MEMORY_ORACLE_PROVENANCE_INVALID');
  }
  return JSON.parse(record.payload_json);
}

async function load(db, request) {
  if (!db || !request?.memoryId || !request.scope?.organizationId || !request.scope.projectId) {
    throw values.failure('MEMORY_ORACLE_SUBJECT_REQUIRED');
  }
  return withTransaction(db, () => loadConsistent(db, request));
}

async function loadConsistent(db, request) {
  const memory = await db.get(`SELECT * FROM genome_decisions WHERE id=? AND organization_id=? AND project_id=?`,
    request.memoryId, request.scope.organizationId, request.scope.projectId);
  if (!memory) throw values.failure('MEMORY_ORACLE_SCOPE_MISMATCH');
  const child = await db.get('SELECT * FROM provenance_records WHERE id=?', memory.provenance_record_id);
  const payload = verifiedPayload(child);
  assertChild(memory, { child, payload });
  const parent = await db.get(`SELECT * FROM provenance_records WHERE payload_hash=?
    AND organization_id=? AND project_id=? AND subject_type='strategy_promotion'`,
    child.parent_hash, request.scope.organizationId, request.scope.projectId);
  const origin = verifiedPayload(parent);
  if (origin.agentId !== memory.created_by || origin.runId !== parent.subject_id) throw values.failure('MEMORY_ORACLE_SOURCE_OWNER_MISMATCH');
  const journal = await require('../promotionExecutionJournal').read(db, origin.runId);
  if (!journal || journal.phase !== 'completed') throw values.failure('MEMORY_ORACLE_PROMOTION_INCOMPLETE');
  const source = journal.payload.promotion;
  assertSource(source, { origin, parent, memory });
  const run = await db.get('SELECT status FROM strategy_execution_runs WHERE id=?', source.runId);
  if (run?.status !== 'completed') throw values.failure('MEMORY_ORACLE_SOURCE_NOT_COMPLETED');
  const assembly = await require('../aeisAssemblyStore').readAssembly(db, origin.assemblyId);
  assertAssembly(assembly, { source, memory });
  return { content: { memory: { id: memory.id, content: memory.content, category: memory.category, payload },
    source: { runId: source.runId, agentId: source.agentId, task: source.task, report: source.report,
      philosophy: source.contract.philosophy, epistemicContext: source.contract.epistemic_context,
      ethicalComparison: source.contract.ethical_comparison } },
  binding: { childHash: child.payload_hash, parentHash: parent.payload_hash, assemblyId: origin.assemblyId,
    scope: request.scope, journalSignature: journal.signature, workspaceRoot: journal.payload.binding.path }, sourceTruth: 'not_evaluated' };
}

function assertChild(memory, input) {
  const { child, payload } = input;
  if (child.subject_type !== 'decision' || child.subject_id !== memory.id || payload.decisionId !== memory.id
      || payload.agentId !== memory.created_by || memory.evidence_status !== 'linked') throw values.failure('MEMORY_ORACLE_OWNER_MISMATCH');
  if (memory.provenance_hash !== child.payload_hash || child.organization_id !== memory.organization_id
      || child.project_id !== memory.project_id) throw values.failure('MEMORY_ORACLE_PROVENANCE_INVALID');
  if (values.digest(JSON.parse(memory.evidence_refs_json)) !== values.digest([child.parent_hash])) throw values.failure('MEMORY_ORACLE_PROVENANCE_INVALID');
}

function assertSource(source, input) {
  if (source.runId !== input.origin.runId || source.agentId !== input.memory.created_by
      || source.contractId !== input.origin.contractId || source.aeisAssemblyId !== input.origin.assemblyId) {
    throw values.failure('MEMORY_ORACLE_SOURCE_BINDING_MISMATCH');
  }
  if (source.organizationId !== input.parent.organization_id || source.projectId !== input.parent.project_id) {
    throw values.failure('MEMORY_ORACLE_SCOPE_MISMATCH');
  }
}

function assertAssembly(assembly, input) {
  const scopeId = [input.memory.organization_id, input.memory.project_id, input.source.workspaceId].join(':');
  if (assembly.runId !== input.source.runId || assembly.scopeId !== scopeId || assembly.evaluation.allAccepted !== true
      || assembly.evaluation.evaluation?.eligible !== true) throw values.failure('MEMORY_ORACLE_SOURCE_ASSURANCE_INVALID');
}

function assertAntigen(antigen, subject) {
  const formal = createFormalResult(antigen?.formalResult);
  if (antigen.id !== formal.resultId || antigen.claim !== STATEMENT || formal.canonicalStatement !== STATEMENT
      || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) throw values.failure('MEMORY_ORACLE_CLAIM_MISMATCH');
  if (values.digest(formal.evidence.content) !== values.digest(subject.content)
      || values.digest(formal.validityDomain) !== values.digest({ ...DOMAIN, constraints: [...DOMAIN.constraints].sort() })) {
    throw values.failure('MEMORY_ORACLE_SUBJECT_CHANGED');
  }
  assertOrigin(formal, subject);
  assertProducer(antigen, subject);
}

function assertProducer(antigen, subject) {
  const expected = { model: 'promotion-memory-compiler', version: '1', actorId: subject.content.source.agentId,
    strategy: 'report-to-memory', workspaceId: subject.binding.workspaceRoot };
  if (values.digest(antigen.producer) !== values.digest(expected)) throw values.failure('MEMORY_ORACLE_PRODUCER_MISMATCH');
}

function assertOrigin(formal, subject) {
  if (formal.provenance.source.uri !== `genos://memories/${subject.content.memory.id}`
      || formal.provenance.source.digest !== `sha256:${values.digest(subject.binding)}`) throw values.failure('MEMORY_ORACLE_ORIGIN_MISMATCH');
}

const { createFormalResult } = require('../formalResultService');
module.exports = { load, assertAntigen, STATEMENT, DOMAIN };
