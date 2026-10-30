'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const values = require('../trinityProvenanceValues');
const store = require('../biologicalWorkerStore');
const provenance = require('../gvxMissionProvenance');
const STATEMENT = 'The observed worker result satisfies its sealed workspace postconditions.';
const DOMAIN = { statement: 'Bounded source and artifact postconditions; no aesthetic or clinical qualification.',
  constraints: ['The verification contract is sealed before worker execution.',
    'Source contents and current artifacts are hash-bound to the execution workspace.',
    'Two isolated strategies recompute the declared postconditions.'] };

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function denied(code) { throw values.failure(code); }

async function load(db, request) {
  const run = await provenance.readRun(db, { runId: request.runId, scope: request.scope });
  const binding = await store.binding(db, request.runId);
  if (!run || binding?.workerId !== request.agentId || request.scope.entityId !== request.agentId) denied('ORACLE_RUNTIME_SUBJECT_MISMATCH');
  const contract = binding.genome.workerContract?.assignment?.workspaceVerificationContract;
  require('./workspaceVerificationContract').assertContract(contract);
  const observations = await store.observations(db, request.runId);
  const observed = observations.filter(o => o.applied && o.event.eventType === 'EVIDENCE_REPORT').at(-1);
  const age = Date.now() - Date.parse(observed?.event.timestamp);
  if (!observed || !Number.isFinite(age) || age < -60000 || age > 600000) denied('ORACLE_SOURCE_STALE');
  return buildSubject(db, { request, run, binding, contract, observed });
}

async function buildSubject(db, input) {
  const { request, run, binding, contract, observed } = input;
  const authority = await require('../missionEnvelopeAuthority').assertRun(db, request);
  if (authority.status !== 'authorized') denied('ORACLE_AUTHORITY_REQUIRED');
  const workspaceRoot = authority.envelope.workspaceRoot;
  const sources = contract.sources.map(source => readSource(workspaceRoot, source));
  const report = observed.event.payload.evidenceReport;
  const content = { contract, sources, report, history: history(workspaceRoot, contract) };
  return { domain: 'workspace_claims', runId: request.runId, workerId: request.agentId,
    content, contentHash: values.digest(content), runBindingHash: run.hash,
    bindingHash: values.digest({ binding, sources, history: content.history }),
    observationHash: observed.hash, observedAt: observed.event.timestamp,
    validUntil: new Date(Date.parse(observed.event.timestamp) + 600000).toISOString() };
}

function readSource(root, source) {
  const target = require('../pathSafety').resolveContainedPathNoSymlinkSync(root, source.path, 'verification source');
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 32768) denied('ORACLE_SOURCE_OUT_OF_BOUNDS');
  const bytes = fs.readFileSync(target);
  const digest = hash(bytes);
  if (!source.mutable && digest !== source.sha256) denied('ORACLE_SOURCE_CHANGED');
  return { path: source.path, sha256: digest, content: bytes.toString('utf8') };
}

function history(root, contract) {
  if (contract.kind !== 'git_numeric_history') return null;
  const relative = require('../pathSafety').normalizeRelativePath(contract.currentPath, 'history source');
  const content = execFileSync('git', ['-C', root, 'show', `HEAD^:${relative}`], {
    encoding: 'utf8', windowsHide: true, timeout: 3000, maxBuffer: 32768
  });
  return { content, sha256: hash(content) };
}

function assertAntigen(antigen, subject) {
  const formal = require('../formalResultService').createFormalResult(antigen?.formalResult);
  if (formal.canonicalStatement !== STATEMENT || antigen.claim !== STATEMENT
      || formal.resultId !== antigen.id || formal.evidence.digest !== antigen.epitopes?.evidence?.digest) denied('ORACLE_CLAIM_BINDING_MISMATCH');
  if (values.digest(formal.evidence.content) !== values.digest(subject.content)
      || values.digest(formal.validityDomain) !== values.digest({ ...DOMAIN, constraints: [...DOMAIN.constraints].sort() })) denied('ORACLE_SEMANTIC_SUBJECT_MISMATCH');
}

module.exports = { load, assertAntigen, STATEMENT, DOMAIN };
