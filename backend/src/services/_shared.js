const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { appendBounded } = require('./boundedOutput');
const { terminateChild } = require('./processTermination');
const { getDatabase } = require('../db');
const { canonicalize } = require('./evaluationGraders');
const { textToVector } = require('./memoryScoring');

const MAX_OUTPUT = 16000;

function run(..._args) {
  const [command, args, cwd, timeoutMs] = _args;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const startedAt = Date.now();
    const timer = setTimeout(() => terminateChild(child), timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-MAX_OUTPUT); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-MAX_OUTPUT); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ command: [command, ...args].join(' '), exitCode, signal, durationMs: Date.now() - startedAt, stdout, stderr });
    });
  });
}

async function walk(directory, relative = '', callback = null) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const childRelative = relative ? path.join(relative, entry.name) : entry.name;
    const childPath = path.join(directory, entry.name);
    if (callback) {
      const result = await callback(entry, childRelative, childPath);
      if (result === 'skip') continue;
    }
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      const subResults = await walk(childPath, childRelative, callback);
      results.push(...subResults);
    } else {
      results.push({ path: childRelative.split(path.sep).join('/'), entry });
    }
  }
  return results;
}

function spawnGit(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `git ${args.join(' ')} exited with code ${code}`))));
  });
}

function estimateCostUsd(..._args) {
  const [costInput, costOutput, inputTokens, outputTokens] = _args;

  return Number(((Number(costInput || 0) * inputTokens + Number(costOutput || 0) * outputTokens) / 1_000_000).toFixed(8));
}

function policyFrom(value = {}) {
  function list(val) {
    return Array.isArray(val) ? val.map(String).map((item) => item.trim()).filter(Boolean) : [];
  }
  return {
    primary: String(value.primary || '').trim() || null,
    fallbacks: list(value.fallbacks),
    parallelReview: list(value.parallelReview),
    mode: value.mode === 'parallel' ? 'parallel' : 'fallback',
    preferLocal: value.preferLocal === true
  };
}

async function loadPolicy(db, { agentId, organizationId, projectId }) {
  if (!db || !agentId) return null;
  const scoped = organizationId && projectId;
  const query = scoped
    ? `SELECT policy_json FROM agent_model_routing_policies
       WHERE (agent_id = ? OR agent_id = '*') AND organization_id = ? AND project_id = ?
       ORDER BY CASE WHEN agent_id = ? THEN 0 ELSE 1 END LIMIT 1`
    : `SELECT policy_json FROM agent_model_routing_policies
       WHERE agent_id = ? OR agent_id = '*' ORDER BY CASE WHEN agent_id = ? THEN 0 ELSE 1 END LIMIT 1`;
  const params = scoped ? [agentId, organizationId, projectId, agentId] : [agentId, agentId];
  const row = await db.get(query, ...params);
  if (!row) return null;
  try { return policyFrom(JSON.parse(row.policy_json || '{}')); } catch (_) { return null; }
}

function decodeEmbeddingBlob(blob) {
  if (!blob) return [];
  try {
    if (Buffer.isBuffer(blob)) {
      const float32 = new Float32Array(blob.buffer, blob.byteOffset, Math.floor(blob.byteLength / 4));
      return Array.from(float32);
    }
  } catch (_) {}
  return [];
}

async function traverseSynapses(..._args) {
  const [topIds = [], db = null, ownerId = '', tenant = {}] = _args;
  if (!db || !topIds.length) return [];
  const placeholders = topIds.map(() => '?').join(',');
  try {
    const ownerClause = ownerId ? ' AND gd.created_by = ?' : '';
    const orgClause = tenant.organizationId ? ' AND (gd.organization_id = ? OR gd.organization_id IS NULL)' : '';
    const synapseOrgClause = tenant.organizationId ? ' AND (ms.organization_id = ? OR ms.organization_id IS NULL)' : '';
    const synapseProjectClause = tenant.projectId ? ' AND (ms.project_id = ? OR ms.project_id IS NULL)' : '';
    const queryParams = [...topIds];
    if (ownerId) queryParams.push(ownerId);
    if (tenant.organizationId) queryParams.push(tenant.organizationId);
    if (tenant.projectId) queryParams.push(tenant.projectId);
    if (tenant.organizationId) queryParams.push(tenant.organizationId);
    const synapses = await db.all(`
      WITH RECURSIVE
        traverse(id, depth, weight) AS (
          SELECT id, 0, 1.0 FROM genome_decisions gd WHERE id IN (${placeholders})${ownerClause}${orgClause}
          UNION
          SELECT
            CASE WHEN ms.source_id = t.id THEN ms.target_id ELSE ms.source_id END,
            t.depth + 1,
            t.weight * (MIN(2.0, ms.weight) / 2.0)
          FROM traverse t
          JOIN memory_synapses ms ON (ms.source_id = t.id OR ms.target_id = t.id)${synapseOrgClause}${synapseProjectClause}
          WHERE t.depth < 2 AND ms.weight > 0 AND (ms.transmitter_type IS NULL OR ms.transmitter_type != 'gaba')
        )
      SELECT id, depth, weight FROM traverse WHERE depth > 0
      ORDER BY weight DESC, depth ASC LIMIT 15
    `, queryParams);
    const linkedIds = [];
    const synapseWeightById = new Map();
    for (const s of synapses) {
      if (!topIds.includes(s.id)) {
        linkedIds.push(s.id);
        if (!synapseWeightById.has(s.id) || s.weight > synapseWeightById.get(s.id)) {
          synapseWeightById.set(s.id, s.weight);
        }
      }
    }
    const uniqueLinkedIds = [...new Set(linkedIds)];
    if (!uniqueLinkedIds.length) return [];
    const linkedPlaceholders = uniqueLinkedIds.map(() => '?').join(',');
    const connectedDecisions = await db.all(
      `SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE id IN (${linkedPlaceholders})${ownerId ? ' AND created_by = ?' : ''}${tenant.organizationId ? ' AND (organization_id = ? OR organization_id IS NULL)' : ''}${tenant.projectId ? ' AND (project_id = ? OR project_id IS NULL)' : ''}`,
      [...uniqueLinkedIds, ...(ownerId ? [ownerId] : []), ...(tenant.organizationId ? [tenant.organizationId] : []), ...(tenant.projectId ? [tenant.projectId] : [])]
    );
    return connectedDecisions.map(item => {
      const edgeWeight = synapseWeightById.get(item.id) ?? 1.0;
      const normalizedEdge = Math.min(2.5, Math.max(0.1, edgeWeight));
      const score = Number(((item.synaptic_weight || 1.0) * 0.4 * normalizedEdge).toFixed(4));
      return {
        id: item.id, title: item.title, category: item.category,
        status: item.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
        summary: item.content, tags: ['genome', item.category, 'graph_association'],
        author: item.created_by, createdAt: item.created_at,
        vector: decodeEmbeddingBlob(item.embedding_blob),
        synaptic_weight: item.synaptic_weight || 1.0,
        similarityScore: score, cosineMetric: 0.5, synaptic_edge_weight: Number(edgeWeight.toFixed(4))
      };
    });
  } catch { return []; }
}

async function fetchTemporalAnchors(..._args) {
  const [timeAnchors = [], db = null, ownerId = '', options = {}] = _args;
  if (!db || !timeAnchors.length) return [];
  const temporalItems = [];
  const horizonHours = Number.isFinite(options.horizonHours) ? options.horizonHours : 24;
  const horizonMs = horizonHours * 3600 * 1000;
  for (const anchor of timeAnchors) {
    if (!anchor.createdAt) continue;
    const anchorTime = new Date(anchor.createdAt).getTime();
    if (Number.isNaN(anchorTime)) continue;
    const minTime = new Date(anchorTime - horizonMs).toISOString();
    const maxTime = new Date(anchorTime + horizonMs).toISOString();
    try {
      let pastQuery = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE created_at < ? AND created_at >= ? AND id != ?';
      const pastParams = [anchor.createdAt, minTime, anchor.id];
      if (ownerId) { pastQuery += ' AND created_by = ?'; pastParams.push(ownerId); }
      if (options.organizationId) { pastQuery += ' AND organization_id = ?'; pastParams.push(options.organizationId); }
      if (options.projectId) { pastQuery += ' AND project_id = ?'; pastParams.push(options.projectId); }
      pastQuery += ' ORDER BY created_at DESC LIMIT 1';
      const prev = await db.get(pastQuery, ...pastParams);
      if (prev) {
        temporalItems.push({
          id: prev.id, title: prev.title, category: prev.category,
          status: prev.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: prev.content, tags: ['genome', 'temporal_context_past'],
          author: prev.created_by, createdAt: prev.created_at,
          vector: decodeEmbeddingBlob(prev.embedding_blob),
          synaptic_weight: prev.synaptic_weight || 1.0,
          similarityScore: Number(((prev.synaptic_weight || 1.0) * 0.35).toFixed(4)), cosineMetric: 0.45
        });
      }
      let nextQuery = 'SELECT id, title, category, content, created_by, created_at, synaptic_weight, embedding_blob FROM genome_decisions WHERE created_at > ? AND created_at <= ? AND id != ?';
      const nextParams = [anchor.createdAt, maxTime, anchor.id];
      if (ownerId) { nextQuery += ' AND created_by = ?'; nextParams.push(ownerId); }
      if (options.organizationId) { nextQuery += ' AND organization_id = ?'; nextParams.push(options.organizationId); }
      if (options.projectId) { nextQuery += ' AND project_id = ?'; nextParams.push(options.projectId); }
      nextQuery += ' ORDER BY created_at ASC LIMIT 1';
      const next = await db.get(nextQuery, ...nextParams);
      if (next) {
        temporalItems.push({
          id: next.id, title: next.title, category: next.category,
          status: next.category === 'Failure' ? 'FAILURE' : 'SUCCESS',
          summary: next.content, tags: ['genome', 'temporal_context_future'],
          author: next.created_by, createdAt: next.created_at,
          vector: decodeEmbeddingBlob(next.embedding_blob),
          synaptic_weight: next.synaptic_weight || 1.0,
          similarityScore: Number(((next.synaptic_weight || 1.0) * 0.35).toFixed(4)), cosineMetric: 0.45
        });
      }
    } catch {}
  }
  return temporalItems;
}

async function compileExecutionMemory(..._args) {
  const [agentId = 'agent', task = '', summary = '', options = {}] = _args;
  if (!summary) return null;
  try {
    const isFailure = Boolean(options.isFailure || options.status === 'failed' || options.outcome === 'failed');
    const epistemics = require('./epistemics');
    const perception = epistemics.validateMemoryPerception({ summary, title: task });
    if (perception.isInvalid()) return null;
    const { evidencePresent } = require('./hallucinationMonitoringService');
    const rawClaims = Array.isArray(options.claims) ? options.claims : (Array.isArray(options.evidenceReport?.claims) ? options.evidenceReport.claims : []);
    const unverifiedClaims = Array.isArray(options.unverifiedClaims) ? options.unverifiedClaims : (Array.isArray(options.evidenceReport?.unverifiedClaims) ? options.evidenceReport.unverifiedClaims : []);
    const hasUnprovenClaims = unverifiedClaims.length > 0 || rawClaims.some(c => !c || !evidencePresent(c.evidence || c.receipts || c.sourceRefs));
    const category = isFailure ? 'Failure' : 'Experience';
    const claimsText = rawClaims.length > 0 ? `\nClaims: ` + rawClaims.map(c => `[${c.statement} | evidence: ${Array.isArray(c.evidence) ? c.evidence.join(', ') : 'verified'}]`).join('; ') : '';
    const verificationTag = hasUnprovenClaims ? '[UNVERIFIED_EVIDENCE]' : '[VERIFIED_SYSTEM_FACT]';
    const content = `${verificationTag} Task: ${task}\nResult: ${summary.slice(0, 800)}${claimsText}`;
    const memId = await vectorMemory.storeMemory(agentId, content, null, { category, tags: hasUnprovenClaims ? ['unverified'] : [], organizationId: options.organizationId, projectId: options.projectId });
    if (options.provenanceHash && memId) {
      try {
        const { recordProvenance } = require('./evaluationObservabilityService');
        await recordProvenance('decision', memId, { decisionId: memId, agentId, task, summary: summary.slice(0, 500), claims: rawClaims }, options.provenanceHash, { organizationId: options.organizationId, projectId: options.projectId });
      } catch (_) {}
    }
    if (!isFailure && !hasUnprovenClaims) {
      try {
        const engramContent = `Agent ${agentId} learned from task "${task.slice(0, 100)}": ${summary.slice(0, 400)}`;
        await vectorMemory.depositExosome({
          new_engrams: [{ content: engramContent, vector: textToVector(engramContent) }],
          plasmid_name: `plasmid_${agentId}_${Date.now()}`,
          plasmid_code: `// Epigenetic transmission from ${agentId}\n// Task: ${task.slice(0, 80)}\n// Insight: ${summary.slice(0, 200)}`,
          organizationId: options.organizationId, projectId: options.projectId
        });
      } catch {}
    }
    return memId;
  } catch { return null; }
}

function runtimeExitOutcome(..._args) {
  const [termination, code, options = {}, domainState = {}] = _args;
  const signal = typeof options === 'object' && options !== null ? options.signal : options;
  const stderr = typeof options === 'object' && options !== null ? (options.stderr || '') : (arguments[3] || '');
  const extra = (typeof options === 'object' && options !== null && options.domainVerdict) ? options : (arguments[4] || domainState || {});
  const hasDomainFailure = Boolean(extra.hasDomainFailure);
  const unverified = Boolean(extra.unverified);
  const explicitFailed = extra.domainVerdict === 'failed' || hasDomainFailure;
  if (termination) {
    return { status: 'blocked', eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning', task: `Runtime halted: ${termination.reason}`, detail: `Runtime halted by ${termination.kind}: ${termination.reason}`, payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason, stderr: String(stderr).trim() } };
  }
  const executionStatus = code === 0 ? 'exit_zero' : 'exit_nonzero';
  let domainVerdict = 'completed';
  if (explicitFailed) domainVerdict = 'failed';
  else if (unverified) domainVerdict = 'unverified';
  if (code === 0) {
    const finalStatus = explicitFailed ? 'failed' : (unverified ? 'unverified' : 'completed');
    const finalEventType = explicitFailed ? 'AGENT_FAILED' : 'AGENT_COMPLETED';
    const severity = explicitFailed ? 'error' : (unverified ? 'warning' : 'info');
    return { status: finalStatus, eventType: finalEventType, action: 'COMPLETE', severity, task: 'Execution completed', detail: `Runtime completed (process: success, domain: ${domainVerdict}).`, payload: { code, executionStatus, domainVerdict } };
  }
  const lastError = String(stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  return { status: 'error', eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error', task: `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`, detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`, payload: { code, signal, stderr: String(stderr).trim(), executionStatus, domainVerdict: 'failed' } };
}

function isRetryableJobError(error = {}) {
  const text = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return error.retryable === true || /timeout|timed out|rate limit|429|econn|enotfound|eai_again|etimedout|socket|network|temporar|connection refused|stream[ _-]?closed|http2|reset|unavailable|5\d\d/.test(text);
}

async function withRetry(..._args) {
  const [db, table, job, executor] = _args;

  const configuredMax = Number(job.max_attempts || 3);
  const max = Number.isFinite(configuredMax) ? Math.max(1, Math.min(Math.floor(configuredMax), 10)) : 3;
  const previousAttempts = Number.isFinite(Number(job.attempts)) ? Math.max(0, Math.floor(Number(job.attempts))) : 0;
  for (let attempt = Math.max(1, previousAttempts + 1); attempt <= max; attempt++) {
    await db.run(`UPDATE ${table} SET attempts = ? WHERE id = ?`, attempt, job.id);
    const { emitEvent: emit } = require('./telemetryObserver');
    emit({ eventType: 'JOB_ATTEMPT_STARTED', action: 'JOB_ATTEMPT', detail: `Started attempt ${attempt}/${max} for ${table} job ${job.id}.`, payload: { table, jobId: job.id, attempt, maxAttempts: max } });
    const heartbeat = setInterval(() => { db.run(`UPDATE ${table} SET claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'`, job.id).catch(() => {}); }, 30_000);
    heartbeat.unref?.();
    try {
      await executor();
      emit({ eventType: 'JOB_COMPLETED', action: 'JOB_COMPLETE', detail: `Completed ${table} job ${job.id}.`, payload: { table, jobId: job.id, attempt } });
      return;
    } catch (error) {
      if (error.code === 'MODEL_JOB_CANCELLED') { await db.run(`UPDATE ${table} SET status = 'cancelled', error_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'`, JSON.stringify({ message: error.message, cancelled: true, attempts: attempt }), job.id); return; }
      if (error.code === 'EVALUATION_JOB_CANCELLED') { await db.run(`UPDATE ${table} SET status = 'cancelled', error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL WHERE id = ? AND status = 'running'`, JSON.stringify({ message: error.message, cancelled: true, attempts: attempt }), job.id); return; }
      if (attempt === max || !isRetryableJobError(error)) {
        const status = error.code === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed';
        const retryable = isRetryableJobError(error);
        const deadLetter = status === 'failed' && retryable && attempt >= max;
        await db.run(`UPDATE ${table} SET status = ?, error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL, next_attempt_at = NULL WHERE id = ?`, status, JSON.stringify({ message: error.message, code: error.code || null, attempts: attempt, retryable, deadLetter, cancelled: status === 'cancelled' }), job.id);
        if (deadLetter) emit({ eventType: 'JOB_DEAD_LETTERED', action: 'JOB_DEAD_LETTER', detail: `${table} job ${job.id} exhausted its retry budget.`, severity: 'error', payload: { table, jobId: job.id, attempt, maxAttempts: max, error: error.message } });
        emit({ eventType: 'JOB_FAILED', action: 'JOB_FAIL', detail: `Failed ${table} job ${job.id}: ${error.message}`, severity: 'error', payload: { table, jobId: job.id, attempt, maxAttempts: max, retryable: isRetryableJobError(error) } });
      } else {
        emit({ eventType: 'JOB_RETRY_SCHEDULED', action: 'JOB_RETRY', detail: `Retry scheduled for ${table} job ${job.id}: ${error.message}`, severity: 'warning', payload: { table, jobId: job.id, attempt, maxAttempts: max } });
        const baseDelay = Math.min(30000, 250 * (2 ** (attempt - 1)));
        const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay / 2)));
        const retryAt = new Date(Date.now() + baseDelay + jitter).toISOString();
        await db.run(`UPDATE ${table} SET status = 'queued', claimed_at = NULL, next_attempt_at = ? WHERE id = ? AND status = 'running'`, retryAt, job.id);
        return;
      }
    } finally { clearInterval(heartbeat); }
  }
}

function reuseAffinity(worker, { mission, role } = {}) {
  if (!worker) return null;
  const MISSION_STOP_WORDS = new Set(['agent', 'worker', 'scope', 'mission', 'task', 'work', 'assigned', 'delegated', 'the', 'and', 'for', 'from', 'with', 'into', 'this', 'that', 'une', 'des', 'les', 'dans', 'pour', 'avec', 'sur', 'par', 'qui', 'que', 'est', 'faire', 'implementation', 'implement', 'review', 'verify', 'audit', 'investigate']);
  function humanize(value) { return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function roleFamily(role) { const normalized = humanize(role).toLowerCase(); if (/literary author|writer|stylist/.test(normalized)) return 'literary_creation'; if (/dramaturg/.test(normalized)) return 'dramaturgy'; if (/literary critic/.test(normalized)) return 'literary_criticism'; if (/red team|attack|offensive/.test(normalized)) return 'security_attack'; if (/blue team|defen|hardening/.test(normalized)) return 'security_defense'; if (/review|observer|verif|audit|test|qa/.test(normalized)) return 'verification'; if (/implement|coder|developer|engineer/.test(normalized)) return 'implementation'; if (/research|investig|analys|diagnos/.test(normalized)) return 'investigation'; return 'generic'; }
  function missionTokens(value) { return humanize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).map((token) => token.length > 4 && token.endsWith('ies') ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is') && !['always', 'analysis', 'status', 'process'].includes(token) ? token.slice(0, -1) : token).filter((token) => token.length >= 3 && !MISSION_STOP_WORDS.has(token)); }
  const requestedFamily = roleFamily(role);
  const workerFamily = roleFamily(worker.role);
  if (requestedFamily !== 'generic' && workerFamily !== requestedFamily) return null;
  const affinity = missionAffinity(mission, `${worker.about || ''} ${worker.name || ''}`);
  return affinity.matches ? affinity : null;
}

function missionAffinity(mission, scope) {
  const MISSION_STOP_WORDS = new Set(['agent', 'worker', 'scope', 'mission', 'task', 'work', 'assigned', 'delegated', 'the', 'and', 'for', 'from', 'with', 'into', 'this', 'that', 'une', 'des', 'les', 'dans', 'pour', 'avec', 'sur', 'par', 'qui', 'que', 'est', 'faire', 'implementation', 'implement', 'review', 'verify', 'audit', 'investigate']);
  function humanize(value) { return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function missionTokens(value) { return humanize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).map((token) => token.length > 4 && token.endsWith('ies') ? `${token.slice(0, -3)}y` : token.length > 4 && token.endsWith('s') && !token.endsWith('ss') && !token.endsWith('us') && !token.endsWith('is') && !['always', 'analysis', 'status', 'process'].includes(token) ? token.slice(0, -1) : token).filter((token) => token.length >= 3 && !MISSION_STOP_WORDS.has(token)); }
  function roleFamily(role) { const normalized = humanize(role).toLowerCase(); if (/literary author|writer|stylist/.test(normalized)) return 'literary_creation'; if (/dramaturg/.test(normalized)) return 'dramaturgy'; if (/literary critic/.test(normalized)) return 'literary_criticism'; if (/red team|attack|offensive/.test(normalized)) return 'security_attack'; if (/blue team|defen|hardening/.test(normalized)) return 'security_defense'; if (/review|observer|verif|audit|test|qa/.test(normalized)) return 'verification'; if (/implement|coder|developer|engineer/.test(normalized)) return 'implementation'; if (/research|investig|analys|diagnos/.test(normalized)) return 'investigation'; return 'generic'; }
  const missionSet = new Set(missionTokens(mission));
  const scopeSet = new Set(missionTokens(scope));
  const shared = [...missionSet].filter((token) => scopeSet.has(token));
  if (!missionSet.size || !scopeSet.size) return { matches: false, score: 0, shared };
  const missionCoverage = shared.length / missionSet.size;
  const scopeCoverage = shared.length / scopeSet.size;
  const singleSpecificMatch = shared.length === 1 && Math.min(missionSet.size, scopeSet.size) === 1 && shared[0].length >= 5;
  const matches = shared.length >= 2 && (missionCoverage >= 0.4 || scopeCoverage >= 0.4) || singleSpecificMatch;
  return { matches, score: matches ? shared.length * 10 + missionCoverage * 3 + scopeCoverage : 0, shared };
}

async function findReusableWorker(..._args) {
  const [db, orchestratorId, { mission, role } = {}] = _args;
  const workers = await db.all(`SELECT id, name, role, about, current_task as currentTask, model_tier as modelTier, language, isolation_mode as isolationMode, created_at as createdAt FROM agents WHERE parent_agent_id = ? AND execution_mode = 'worker' AND status = 'idle' AND workspace_id = (SELECT workspace_id FROM agents WHERE id = ?) ORDER BY updated_at DESC, created_at DESC, id`, orchestratorId, orchestratorId);
  return workers.map((worker) => { const affinity = reuseAffinity(worker, { mission, role }); return affinity ? { ...worker, affinity } : null; }).filter(Boolean).sort((left, right) => right.affinity.score - left.affinity.score)[0] || null;
}

async function recordProvenance(..._args) {
  const [subjectType, subjectId, payload, parentHash = null, scope = {}] = _args;
  const db = await getDatabase();
  if (parentHash) {
    const parent = scope.organizationId && scope.projectId ? await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id = ? AND project_id = ?', parentHash, scope.organizationId, scope.projectId) : await db.get('SELECT id FROM provenance_records WHERE payload_hash = ? AND organization_id IS NULL AND project_id IS NULL', parentHash);
    if (!parent) throw Object.assign(new Error(`Provenance parent '${parentHash}' was not found.`), { code: 'PROVENANCE_PARENT_NOT_FOUND' });
  }
  const payloadJson = JSON.stringify(canonicalize(payload));
  const payloadHash = crypto.createHash('sha256').update(payloadJson).digest('hex');
  const id = `prov-${crypto.randomUUID()}`;
  await db.run('INSERT INTO provenance_records (id, subject_type, subject_id, payload_hash, parent_hash, payload_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, subjectType, subjectId, payloadHash, parentHash, payloadJson, scope.organizationId || null, scope.projectId || null);
  return { id, subjectType, subjectId, payloadHash, parentHash, algorithm: 'sha256' };
}

const persistTails = new Map();

async function persistConscienceState(..._args) {
  const [db, agentId, state, options = {}] = _args;
  const previousTail = persistTails.get(agentId) || Promise.resolve();
  const operation = previousTail.catch(() => {}).then(() => persistConscienceStateNow(db, agentId, state, true, options));
  const tracked = operation.catch(() => {}).finally(() => { if (persistTails.get(agentId) === tracked) persistTails.delete(agentId); });
  persistTails.set(agentId, tracked);
  return operation;
}

async function persistConscienceStateNow(..._args) {
  const [db, agentId, state, retry = true, options = {}] = _args;
  const previous = await db.get('SELECT dissonance_level, cognitive_budget, is_apoptotic, conscience_revision FROM agents WHERE id = ?', agentId);
  if (!previous) throw new Error(`Agent ${agentId} not found in database for conscience persistence`);
  const result = await db.run(`UPDATE agents SET dissonance_level = ?, eureka_count = ?, cognitive_budget = ?, cognitive_baseline_budget = ?, cognitive_max_dissonance = ?, is_apoptotic = ?, conscience_revision = conscience_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND conscience_revision = ?`, state.dissonanceLevel, state.eurekaMoments, state.currentBudget, state.baselineBudget, state.maxDissonanceThreshold, state.isApoptotic ? 1 : 0, agentId, state.revision);
  if (result.changes !== 1) {
    if (!retry) throw new Error(`Conscience state conflict for agent ${agentId} at revision ${state.revision}`);
    const current = await loadConscienceState(db, agentId);
    state.dissonanceLevel = Math.max(state.dissonanceLevel, current.dissonanceLevel);
    state.eurekaMoments = Math.max(state.eurekaMoments, current.eurekaMoments);
    state.currentBudget = Math.min(state.currentBudget, current.currentBudget);
    state.isApoptotic = state.isApoptotic || current.isApoptotic;
    state.revision = current.revision;
    return persistConscienceStateNow(db, agentId, state, false, options);
  }
  const transitionReason = String(options.reason || 'evaluation');
  await db.run(`INSERT INTO conscience_transitions (agent_id, from_revision, to_revision, from_dissonance, to_dissonance, from_budget, to_budget, from_apoptotic, to_apoptotic, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, agentId, previous?.conscience_revision ?? state.revision, state.revision + 1, previous?.dissonance_level ?? state.dissonanceLevel, state.dissonanceLevel, previous?.cognitive_budget ?? state.currentBudget, state.currentBudget, previous?.is_apoptotic ? 1 : 0, state.isApoptotic ? 1 : 0, transitionReason);
  state.revision += 1;
}

async function loadConscienceState(db, agentId) {
  try { const row = await db.get('SELECT dissonance_level, eureka_count, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, is_apoptotic, conscience_revision FROM agents WHERE id = ?', agentId); if (!row) return { currentBudget: 100.0, baselineBudget: 100.0, dissonanceLevel: 0.0, eurekaMoments: 0, isApoptotic: false, maxDissonanceThreshold: 50.0, revision: 0, eurekaWindowStartedAt: 0, eurekaWindowCount: 0 }; return { currentBudget: Math.max(0, Number(row.cognitive_budget) || 100.0), baselineBudget: Math.max(0, Number(row.cognitive_baseline_budget) || 100.0), dissonanceLevel: Math.max(0, Number(row.dissonance_level) || 0.0), eurekaMoments: Math.max(0, Math.floor(Number(row.eureka_count) || 0)), isApoptotic: Boolean(row.is_apoptotic), maxDissonanceThreshold: Math.max(0.000001, Number(row.cognitive_max_dissonance) || 50.0), revision: Math.max(0, Math.floor(Number(row.conscience_revision) || 0)), eurekaWindowStartedAt: 0, eurekaWindowCount: 0 }; } catch (error) { throw new Error(`Unable to load conscience state for agent ${agentId}: ${error.message}`); }
}

function restore({ db, workspace, reference, author = 'studio' }) {
  if (!workspace?.path) throw new Error('Workspace path is required for restore.');
  const { withRestoreLock } = require('./workspaceSnapshotStore');
  return withRestoreLock(workspace.path, () => restoreUnlocked({ db, workspace, reference, author }));
}

async function restoreUnlocked({ db, workspace, reference, author = 'studio' }) {
  const { getSnapshot } = require('./workspaceSnapshotStore');
  const { capture } = require('./workspaceSnapshotStore');
  const { materialize } = require('./workspaceSnapshotStore');
  const { removeWorkspaceFiles } = require('./workspaceSnapshotStore');
  const { copyMaterializedFiles } = require('./workspaceSnapshotStore');
  const { manifestHash } = require('./workspaceSnapshotStore');
  const { collectFiles } = require('./workspaceSnapshotStore');
  const { readManifest } = require('./workspaceSnapshotStore');
  const target = await getSnapshot(db, workspace.id, reference);
  const backup = await capture({ db, workspace, label: 'Pre-restore safety snapshot', reason: `Before restoring ${target.id}`, author });
  const os = require('os');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-restore-'));
  const backupStaging = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-restore-backup-'));
  try {
    const verified = await materialize(target, staging);
    await materialize({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path }, backupStaging);
    await removeWorkspaceFiles(workspace.path);
    await copyMaterializedFiles(staging, verified.files, workspace.path);
    if (manifestHash(await collectFiles(workspace.path)) !== verified.hash) throw new Error(`Snapshot restore checksum mismatch for ${workspace.path}.`);
    return { success: true, restoredSnapshot: target, safetySnapshot: backup, strategy: 'manifest-copy' };
  } catch (error) {
    try {
      await removeWorkspaceFiles(workspace.path);
      const backupManifest = await readManifest({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path });
      await copyMaterializedFiles(backupStaging, backupManifest.files, workspace.path);
      if (manifestHash(await collectFiles(workspace.path)) !== backupManifest.hash) throw new Error(`Safety snapshot checksum mismatch for ${workspace.path}.`);
    } catch (rollbackError) { error.message += ` Recovery snapshot restore also failed: ${rollbackError.message}`; }
    throw error;
  } finally { await fs.rm(staging, { recursive: true, force: true }).catch(() => {}); await fs.rm(backupStaging, { recursive: true, force: true }).catch(() => {}); }
}

module.exports = {
  run, walk, spawnGit, restore, restoreUnlocked, compileExecutionMemory,
  runtimeExitOutcome, estimateCostUsd, loadPolicy, policyFrom,
  traverseSynapses, fetchTemporalAnchors, decodeEmbeddingBlob,
  withRetry, isRetryableJobError, findReusableWorker, reuseAffinity, missionAffinity,
  recordProvenance, persistConscienceState, persistConscienceStateNow, loadConscienceState
};
