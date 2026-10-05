'use strict';

const crypto = require('node:crypto');
const consolidation = require('./proceduralConsolidationService');

const executors = new Map();
const TABLES = `
CREATE TABLE IF NOT EXISTS procedural_compilation_traces (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, context_hash TEXT NOT NULL,
  context_json TEXT NOT NULL, context_signature TEXT NOT NULL,
  trajectory_json TEXT NOT NULL, input_json TEXT, evidence_json TEXT NOT NULL,
  success INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS procedural_trace_lookup
  ON procedural_compilation_traces(agent_id, context_hash, success);
CREATE TABLE IF NOT EXISTS procedural_compiled_procedures (
  procedure_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, context_hash TEXT NOT NULL,
  context_json TEXT NOT NULL, context_signature TEXT NOT NULL,
  procedure_json TEXT NOT NULL, receipt_json TEXT NOT NULL, status TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS procedural_active_lookup
  ON procedural_compiled_procedures(agent_id, context_hash, status);`;

function sha(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

const VOLATILE_CONTEXT_KEYS = new Set(['contextHash', 'requestId', 'sessionId', 'traceId', 'timestamp', 'observedAt']);

function normalizeContext(value) {
  if (Array.isArray(value)) return value.map(normalizeContext);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(Object.keys(value).filter((key) => !VOLATILE_CONTEXT_KEYS.has(key)).sort()
    .map((key) => [key, normalizeContext(value[key])]));
}

function contextFeatures(context) {
  const features = [];
  function visit(value, path) {
    if (Array.isArray(value)) {
      features.push(`${path}:array:${value.length}`);
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') {
      features.push(`${path}:${typeof value}:${String(value)}`);
      return;
    }
    Object.keys(value).sort().forEach((key) => {
      const childPath = `${path}.${key}`;
      const child = value[key];
      features.push(`${childPath}:type:${Array.isArray(child) ? 'array' : typeof child}`);
      visit(child, childPath);
    });
  }
  visit(normalizeContext(context), '$');
  return features;
}

function jaccard(left, right) {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]).size;
  return union ? [...a].filter((item) => b.has(item)).length / union : 1;
}

function contextSimilarity(left, right) {
  const a = contextFeatures(left);
  const b = contextFeatures(right);
  return (jaccard(a.filter((item) => item.includes(':type:') || item.includes(':array:')), b.filter((item) => item.includes(':type:') || item.includes(':array:'))) * 0.7)
    + (jaccard(a.filter((item) => !item.includes(':type:') && !item.includes(':array:')), b.filter((item) => !item.includes(':type:') && !item.includes(':array:'))) * 0.3);
}

function contextSignature(context) { return sha(normalizeContext(context)); }

function contextFor(options, contract) { return { domain: contract.nativeGraph?.domain || options.cognitiveDomain || 'runtime', operation: options.cognitiveOperation || contract.operation || 'INFER', topology: options.cognitiveTopology || null, level: options.cognitiveLevel || null }; }

function matchThreshold(input) {
  return Math.max(0.5, Math.min(1, Number(input.contextSimilarityThreshold
    ?? input.policy?.contextSimilarityThreshold ?? 0.8)));
}

function contextMatch(candidate, input) {
  if (candidate.contextHash === String(input.contextHash)) return 1;
  if (input.context == null || candidate.context == null) return 0;
  const similarity = contextSimilarity(candidate.context, input.context);
  return similarity >= matchThreshold(input) ? similarity : 0;
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function ensure(db) {
  await db.exec(TABLES);
  for (const statement of [
    'ALTER TABLE procedural_compilation_traces ADD COLUMN context_json TEXT NOT NULL DEFAULT \'{}\'',
    'ALTER TABLE procedural_compilation_traces ADD COLUMN context_signature TEXT NOT NULL DEFAULT \'\'',
    'ALTER TABLE procedural_compiled_procedures ADD COLUMN context_json TEXT NOT NULL DEFAULT \'{}\'',
    'ALTER TABLE procedural_compiled_procedures ADD COLUMN context_signature TEXT NOT NULL DEFAULT \'\'',
  ]) {
    try { await db.exec(statement); } catch (_) { /* columns already exist */ }
  }
}

function traceFrom(input) {
  if (!input?.agentId || !input.contextHash || !Array.isArray(input.steps) || input.steps.length < 2
      || !input.steps.every((step) => typeof step === 'string' && step.length > 0)) {
    throw new TypeError('A procedural trace requires an agent, context and bounded string steps.');
  }
  const evidence = Array.isArray(input.evidenceRefs) ? [...new Set(input.evidenceRefs)] : [];
  if (input.success && evidence.length === 0) throw new TypeError('Successful procedural traces require evidence.');
  return { id: input.id || `trace:${sha({ agent: input.agentId, context: input.contextHash,
    steps: input.steps, input: input.input, at: input.observedAt || Date.now() })}`,
    agentId: String(input.agentId), contextHash: String(input.contextHash), context: normalizeContext(input.context || {}),
    contextSignature: contextSignature(input.context || {}), trajectory: input.steps.slice(0, 64),
    input: input.input ?? null, evidenceRefs: evidence, success: input.success === true,
    observedAt: input.observedAt || new Date().toISOString() };
}

async function recordTrace(db, input) {
  const trace = traceFrom(input);
  await ensure(db);
  await db.run(`INSERT OR IGNORE INTO procedural_compilation_traces
    (id, agent_id, context_hash, context_json, context_signature, trajectory_json, input_json, evidence_json, success, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, trace.id, trace.agentId, trace.contextHash,
  JSON.stringify(trace.context), trace.contextSignature,
  JSON.stringify(trace.trajectory), JSON.stringify(trace.input), JSON.stringify(trace.evidenceRefs),
  trace.success ? 1 : 0, trace.observedAt);
  return trace;
}

async function loadTraces(db, input) {
  await ensure(db);
  const rows = await db.all(`SELECT * FROM procedural_compilation_traces
    WHERE agent_id = ? ORDER BY created_at ASC`, String(input.agentId));
  return rows.map((row) => ({ id: row.id, agentId: row.agent_id, contextHash: row.context_hash,
    context: parseJson(row.context_json || '{}', {}), contextSignature: row.context_signature || '',
    trajectory: parseJson(row.trajectory_json, []), input: parseJson(row.input_json || 'null', null),
    evidenceRefs: parseJson(row.evidence_json || '[]', []), success: row.success === 1, observedAt: row.created_at,
    contextMatch: contextMatch({ contextHash: row.context_hash, context: parseJson(row.context_json || '{}', {}) }, input) }))
    .filter((trace) => trace.contextMatch > 0);
}

async function compile(db, input) {
  const traces = await loadTraces(db, input);
  const successful = traces.filter((trace) => trace.success);
  const episodes = traces.map((trace) => ({ ...trace, outcome: trace.success ? 'success' : 'failure' }));
  const result = consolidation.consolidatePath(input.policy || {}, episodes);
  if (!result.consolidated) return { status: 'not_ready', reason: result.reason, traces: traces.length };
  const procedure = { version: 1, procedureId: `procedure:${sha({ agent: input.agentId,
    context: input.contextHash, contextSignature: contextSignature(input.context), steps: result.path })}`, agentId: String(input.agentId),
    contextHash: String(input.contextHash), context: normalizeContext(input.context || {}),
    contextSignature: contextSignature(input.context || {}), steps: result.path, executorId: input.executorId || null,
    prerequisites: input.prerequisites || [], provenance: { traceIds: successful.map((trace) => trace.id),
      evidenceRefs: [...new Set(successful.flatMap((trace) => trace.evidenceRefs))],
      successRate: result.provenance.successRate, contextSimilarity: Math.min(...traces.map((trace) => trace.contextMatch || 1)) } };
  return { status: 'candidate', procedure, traces, validationRequired: true };
}

async function validate(candidate, input) {
  if (!candidate?.procedure || typeof input?.validator !== 'function') {
    return { valid: false, reason: 'procedural_validator_required' };
  }
  if (!candidate.procedure.provenance?.evidenceRefs?.length) {
    return { valid: false, reason: 'procedural_evidence_required' };
  }
  const result = await input.validator(candidate.procedure, candidate.traces);
  const valid = result?.valid === true || result?.status === 'verified' || result?.reproducible === true;
  return { valid, result, reason: valid ? null : 'procedural_replay_failed' };
}

async function compileAndPromote(db, input) {
  const candidate = await compile(db, input);
  if (input.autoPromote !== true || candidate.status !== 'candidate') return candidate;
  return promote(db, { ...input, candidate });
}

async function promote(db, input) {
  const candidate = input.candidate || await compile(db, input);
  if (candidate.status !== 'candidate') return candidate;
  const checked = await validate(candidate, input);
  if (!checked.valid) return { status: 'blocked', reason: checked.reason, validation: checked.result || null };
  const now = new Date().toISOString();
  const receipt = { kind: 'procedural-promotion', procedureId: candidate.procedure.procedureId,
    evidenceRefs: candidate.procedure.provenance.evidenceRefs, traceIds: candidate.procedure.provenance.traceIds,
    validation: checked.result, validatedAt: now, digest: sha({ procedure: candidate.procedure, validation: checked.result }) };
  await ensure(db);
  await db.run(`UPDATE procedural_compiled_procedures SET status = 'superseded', updated_at = ?
    WHERE agent_id = ? AND context_hash = ? AND status = 'active'`, now, candidate.procedure.agentId, candidate.procedure.contextHash);
  await db.run(`INSERT OR REPLACE INTO procedural_compiled_procedures
    (procedure_id, agent_id, context_hash, context_json, context_signature, procedure_json, receipt_json, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`, candidate.procedure.procedureId, candidate.procedure.agentId,
  candidate.procedure.contextHash, JSON.stringify(candidate.procedure.context), candidate.procedure.contextSignature,
  JSON.stringify(candidate.procedure), JSON.stringify(receipt), now, now);
  return { status: 'promoted', procedure: candidate.procedure, receipt };
}

function registerExecutor(id, executor) {
  if (!id || typeof executor !== 'function') throw new TypeError('A procedural executor function is required.');
  executors.set(String(id), executor);
  return id;
}

async function reuse(db, input) {
  await ensure(db);
  const rows = await db.all(`SELECT procedure_json, receipt_json FROM procedural_compiled_procedures
    WHERE agent_id = ? AND status = 'active'`, String(input.agentId));
  const matches = rows.map((row) => ({ row, procedure: parseJson(row.procedure_json, null) }))
    .filter((entry) => entry.procedure)
    .map((entry) => ({ ...entry, contextMatch: contextMatch({ contextHash: entry.procedure.contextHash,
      context: entry.procedure.context || {} }, input) }))
    .filter((entry) => entry.contextMatch > 0)
    .sort((left, right) => right.contextMatch - left.contextMatch);
  const match = matches[0];
  if (!match) return { status: 'miss', reason: 'procedure_not_promoted', llmCalls: 0 };
  const { procedure } = match;
  const executor = input.executor || executors.get(procedure.executorId);
  if (typeof executor !== 'function') return { status: 'blocked', reason: 'procedure_executor_missing', llmCalls: 0 };
  const steps = [];
  let value = input.input;
  for (let index = 0; index < procedure.steps.length; index++) {
    value = await executor({ step: procedure.steps[index], index, input: value, procedure });
    steps.push({ step: procedure.steps[index], result: value });
  }
  return { status: 'reused', value, steps, llmCalls: 0, costUsd: 0,
    procedure, contextMatch: match.contextMatch, promotionReceipt: parseJson(match.row.receipt_json, null) };
}

module.exports = { ensure, traceFrom, recordTrace, loadTraces, compile, validate, promote,
  compileAndPromote, registerExecutor, reuse, normalizeContext, contextSignature, contextSimilarity, contextFor };
