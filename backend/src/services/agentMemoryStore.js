/**
 * GenOS Agent Memory Store (N11)
 * Persists execution memories with three guarantees:
 * (a) no double-write: vectorMemory.storeMemory is content-addressed
 *     (same agent + content returns the existing id without rewriting),
 *     so re-compiling the same record is a no-op;
 * (b) unproven claims never join the verified namespace: they are stored
 *     under category `UnverifiedExperience` with an `[unverified/]` content
 *     marker and an advisory 7-day expiry stamp (genome_decisions has no
 *     expires_at column, so TTL is content-encoded), and readers filter
 *     them out before prompt injection;
 * (c) exosomes: a single in-process deposit per (agentId, task-hash) with a
 *     deterministic plasmid name (no Date.now), bounded bookkeeping.
 * Unexpected errors are telemetered (MEMORY_STORE_FAILED) and the historical
 * null shape is kept: both callers (strategyPromotionGate, which ignores the
 * return, and tests, which assert null for invalid input) handle null.
 */

const crypto = require('crypto');
const { storeFailed } = require('./agentMemoryTelemetry');

const depositedExosomes = new Set();
const MAX_DEPOSIT_KEYS = 2000;
const UNVERIFIED_TTL_MS = 7 * 24 * 3600 * 1000;

async function compileExecutionMemory(..._args) {
  const [agentId, task, summary, options] = _args;
  if (!summary) return null;
  try {
    const job = { agentId: agentId || 'agent', task: task || '', summary, options: options || {} };
    return await persistExecutionMemory(job);
  } catch (error) {
    storeFailed(agentId, error, 'compile-execution-memory');
    return null;
  }
}

async function persistExecutionMemory(job) {
  if (!checkPerception(job)) return null;
  const record = buildMemoryRecord(job);
  const memId = await storeMemoryRecord(job, record);
  await recordMemoryProvenance(job, record, memId);
  await maybeDepositExosome(job, record);
  return memId;
}

function checkPerception(job) {
  const epistemics = require('./epistemics');
  const perception = epistemics.validateMemoryPerception({ summary: job.summary, title: job.task });
  if (perception.isInvalid()) return null;
  return perception;
}

function claimInputs(job) {
  const options = job.options || {};
  if (Array.isArray(options.claims)) return { raw: options.claims, unverified: options.unverifiedClaims || [] };
  const report = options.evidenceReport || {};
  return { raw: report.claims || [], unverified: report.unverifiedClaims || [] };
}

function isUnprovenClaim(claim, evidence) {
  if (!claim) return true;
  return !evidence.evidencePresent(claim.evidence || claim.receipts || claim.sourceRefs);
}

function hasUnprovenClaims(inputs) {
  if (inputs.unverified.length > 0) return true;
  const evidence = require('./hallucinationMonitoringService');
  return inputs.raw.some((claim) => isUnprovenClaim(claim, evidence));
}

function isFailureJob(job) {
  const options = job.options || {};
  return Boolean(options.isFailure || options.status === 'failed' || options.outcome === 'failed');
}

function taskHashFor(job) {
  return crypto.createHash('sha256').update(`${job.agentId}\0${job.task}`).digest('hex').slice(0, 32);
}

function unverifiedExpiryIso() {
  return new Date(Date.now() + UNVERIFIED_TTL_MS).toISOString();
}

function formatSingleClaim(claim) {
  const shown = Array.isArray(claim.evidence) ? claim.evidence.join(', ') : 'verified';
  return `[${claim.statement} | evidence: ${shown}]`;
}

function formatClaimsText(raw) {
  return `\nClaims: ` + raw.map(formatSingleClaim).join('; ');
}

function memoryContent(job, inputs, unproven) {
  const claimsText = inputs.raw.length > 0 ? formatClaimsText(inputs.raw) : '';
  const tag = unproven ? '[UNVERIFIED_EVIDENCE][unverified/]' : '[VERIFIED_SYSTEM_FACT]';
  const base = `${tag} Task: ${job.task}\nResult: ${String(job.summary).slice(0, 800)}${claimsText}`;
  if (unproven) return `${base}\n[expires: ${unverifiedExpiryIso()}]`;
  return base;
}

function buildMemoryRecord(job) {
  const inputs = claimInputs(job);
  const unproven = hasUnprovenClaims(inputs);
  const failed = isFailureJob(job);
  const category = failed ? 'Failure' : (unproven ? 'UnverifiedExperience' : 'Experience');
  const content = memoryContent(job, inputs, unproven);
  return { category, content, unproven, failed, rawClaims: inputs.raw, taskHash: taskHashFor(job) };
}

async function storeMemoryRecord(job, record) {
  const vectorMemory = require('./vectorMemoryService');
  const options = job.options || {};
  return vectorMemory.storeMemory(job.agentId, record.content, null, {
    category: record.category,
    tags: record.unproven ? ['unverified'] : [],
    organizationId: options.organizationId,
    projectId: options.projectId
  });
}

async function recordMemoryProvenance(job, record, memId) {
  const options = job.options || {};
  if (!options.provenanceHash || !memId) return;
  try {
    const { recordProvenance } = require('./evaluationObservabilityService');
    await recordProvenance('decision', memId, {
      decisionId: memId,
      agentId: job.agentId,
      task: job.task,
      summary: String(job.summary).slice(0, 500),
      claims: record.rawClaims
    }, options.provenanceHash, { organizationId: options.organizationId, projectId: options.projectId });
  } catch (error) {
    storeFailed(job.agentId, error, 'memory-provenance');
  }
}

function depositKey(job, record) {
  return `${job.agentId}\0${record.taskHash}`;
}

function alreadyDeposited(job, record) {
  return depositedExosomes.has(depositKey(job, record));
}

function markDeposited(job, record) {
  if (depositedExosomes.size >= MAX_DEPOSIT_KEYS) {
    const oldest = depositedExosomes.values().next().value;
    depositedExosomes.delete(oldest);
  }
  depositedExosomes.add(depositKey(job, record));
}

function clearDepositCache() {
  depositedExosomes.clear();
}

async function depositTaskExosome(job, record) {
  const vectorMemory = require('./vectorMemoryService');
  const scoring = require('./memoryScoring');
  const options = job.options || {};
  const engramContent = `Agent ${job.agentId} learned from task "${String(job.task).slice(0, 100)}": ${String(job.summary).slice(0, 400)}`;
  await vectorMemory.depositExosome({
    new_engrams: [{ content: engramContent, vector: scoring.textToVector(engramContent) }],
    plasmid_name: `plasmid_${job.agentId}_${record.taskHash.slice(0, 16)}`,
    plasmid_code: `// Epigenetic transmission from ${job.agentId}\n// Task: ${String(job.task).slice(0, 80)}\n// Insight: ${String(job.summary).slice(0, 200)}`,
    organizationId: options.organizationId,
    projectId: options.projectId
  });
}

async function maybeDepositExosome(job, record) {
  if (record.failed || record.unproven) return;
  if (alreadyDeposited(job, record)) return;
  try {
    await depositTaskExosome(job, record);
    markDeposited(job, record);
  } catch (error) {
    storeFailed(job.agentId, error, 'exosome-deposit');
  }
}

module.exports = {
  compileExecutionMemory,
  clearDepositCache
};
