'use strict';

const crypto = require('node:crypto');
const strategyExecution = require('./strategyExecutionService');
const { emit } = require('./agentOrchestrationState');

const FAILURE_DIAGNOSTICS_SCHEMA = 'genos.worker-code-failure/v1';

function testOutput(error) {
  return (error?.proposal?.tests || []).map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
}

function classifyFailure(error) {
  const code = String(error?.code || '');
  const text = `${code}\n${error?.message || ''}\n${testOutput(error)}\n${error?.workerArtifactDiagnostics?.error || ''}`;
  if (code === 'WORKER_OUTPUT_SCHEMA_VIOLATION') return 'schema_rejection';
  if (/MODEL_ROUTE_DEADLINE_EXCEEDED|(?:model|provider|route).{0,40}(?:timeout|deadline)|(?:timeout|deadline).{0,40}(?:model|provider|route)/i.test(text)) {
    return 'model_provider_timeout';
  }
  if (code === 'WORKER_TEST_ENVIRONMENT_FAILED') return 'test_environment_unavailable';
  if (/ENOSPC|no space left on device|disk full|espace insuffisant|failed to create cache directory/i.test(text)) {
    return 'browser_disk_enospc';
  }
  if (/browserType\.launch|failed to create initial profile|<launching>|target page, context or browser has been closed/i.test(text)) {
    return 'browser_launch_failure';
  }
  if (/strict mode violation|locator\.(?:click|fill|selectOption|waitFor)|waiting for getBy(?:Label|Role|Text)|getBy(?:Label|Role|Text)\(/i.test(text)) {
    return 'app_locator_failure';
  }
  if (/AssertionError|assert\.(?:equal|strictEqual|ok|match)|expected values to be strictly equal/i.test(text)) {
    return 'app_assertion_failure';
  }
  if (/ECONN|fetch failed|provider/i.test(text)) return 'model_provider_failure';
  if (code === 'WORKER_TESTS_FAILED') return 'app_test_failure';
  return 'worker_failure';
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count })).slice(0, 12);
}

function controlDiagnostics(source) {
  const markup = String(source || '');
  const tags = [...markup.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)];
  const ids = [];
  const controlNames = [];
  const accessibleNames = [];
  for (const match of tags) {
    const tag = match[0];
    const id = tag.match(/\bid\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (id) ids.push(id);
    if (/^<(?:input|select|textarea|button)\b/i.test(tag)) {
      const name = tag.match(/\bname\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (name) controlNames.push(name);
      const aria = tag.match(/\baria-label\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (aria) accessibleNames.push(aria);
    }
  }
  const labelFor = [...markup.matchAll(/<label\b[^>]*\bfor\s*=\s*(["'])(.*?)\1[^>]*>/gi)]
    .map((match) => match[2]);
  const labelText = [...markup.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label\s*>/gi)]
    .map((match) => match[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  return { duplicateIds: duplicateValues(ids), duplicateLabelTargets: duplicateValues(labelFor),
    duplicateLabels: duplicateValues(labelText), duplicateControlNames: duplicateValues(controlNames),
    duplicateAccessibleNames: duplicateValues(accessibleNames) };
}

function candidateDiagnostics(error) {
  const patches = (error?.proposal?.failedPatchContents || [])
    .map(({ path, content }) => ({ path: String(path || ''), content: String(content || '') }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (!patches.length) return { candidateDigest: null, candidateFiles: [], candidateChanged: null };
  const files = patches.map(({ path, content }) => ({ path,
    sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(content, 'utf8'), ...controlDiagnostics(content) }));
  return { candidateDigest: crypto.createHash('sha256').update(JSON.stringify(files.map(({ path, sha256 }) => ({ path, sha256 })))).digest('hex'),
    candidateFiles: files, candidateChanged: null };
}

function buildFailureDiagnostics(error) {
  return { schema: FAILURE_DIAGNOSTICS_SCHEMA, category: classifyFailure(error),
    code: error?.code || null, candidate: candidateDiagnostics(error) };
}

function candidateChanged(previousDigest, currentDigest) {
  if (!previousDigest || !currentDigest) return null;
  return previousDigest !== currentDigest;
}

async function previousCandidateDigest(db, agentId) {
  if (!db || !agentId || typeof db.all !== 'function') return null;
  try {
    const rows = await db.all(`SELECT payload_json FROM telemetry_events
      WHERE agent_id = ? AND event_type = 'LOCAL_CODE_TEST_REPAIR'
      ORDER BY created_at DESC, id DESC LIMIT 1`, agentId);
    const payload = rows?.[0]?.payload_json ? JSON.parse(rows[0].payload_json) : null;
    return payload?.failureDiagnostics?.candidate?.candidateDigest || payload?.candidateDigest || null;
  } catch (_) { return null; }
}

function summarizeFailedPatches(error) {
  const failureText = (error.proposal?.tests || [])
    .map((test) => `${test.stdout || ''}\n${test.stderr || ''}`).join('\n');
  return (error.proposal?.failedPatchContents || []).map((patch) => {
    const source = String(patch.content || '');
    const controls = [
      ...[...source.matchAll(/<input\b[^>]*>/gi)].map((match) => match[0]),
      ...[...source.matchAll(/<select\b[^>]*>[\s\S]*?<\/select\s*>/gi)].map((match) => match[0]),
      ...[...source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button\s*>/gi)].map((match) => match[0]),
      ...[...source.matchAll(/<label\b[^>]*>[\s\S]*?<\/label\s*>/gi)].map((match) => match[0])
    ].slice(0, 24).map((markup) => markup.replace(/\s+/g, ' ').slice(0, 300));
    const roles = [...source.matchAll(/<(?:div|span|a)\b[^>]*\brole\s*=\s*["'](?:button|combobox|searchbox)["'][^>]*>(?:[\s\S]*?<\/(?:div|span|a)\s*>)?/gi)]
      .slice(0, 12).map((match) => match[0].replace(/\s+/g, ' ').slice(0, 300));
    const logic = [];
    for (const script of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      const code = script[1];
      for (const marker of ['function handleAddItem', 'function addNewItem', 'function renderItem',
        'function addItem', 'function increaseQuantity', 'function handleFilterChange', 'function handleSearch',
        'function filterItems']) {
        const index = code.toLowerCase().indexOf(marker.toLowerCase());
        if (index >= 0) logic.push(code.slice(index, Math.min(code.length, index + 1200)).replace(/\s+/g, ' '));
      }
      for (const marker of ["addEventListener('submit'", 'addEventListener("submit"', 'onsubmit',
        'localStorage', 'addEventListener', 'addItem', 'render(']) {
        const index = code.toLowerCase().indexOf(marker.toLowerCase());
        if (index < 0) continue;
        logic.push(code.slice(Math.max(0, index - 120), Math.min(code.length, index + 280)).replace(/\s+/g, ' '));
      }
    }
    if (/\.(?:[cm]?js|tsx?)$/i.test(patch.path)) {
      logic.push(...exportedFunctionSnippets(source, failureText).slice(0, Math.max(0, 8 - logic.length)));
    }
    return { path: patch.path, bytes: Buffer.byteLength(source, 'utf8'), controls, roles,
      logic: logic.slice(0, 8) };
  });
}

function exportedFunctionSnippets(source, failureText = '') {
  const names = new Set();
  const exportsObject = String(source).match(/\bmodule\.exports\s*=\s*\{([^}]+)\}/);
  for (const declaration of (exportsObject?.[1] || '').split(',')) {
    const name = declaration.trim().split(/\s*:\s*/)[0];
    if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
  }
  for (const match of String(source).matchAll(/\bexports\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(match[1]);
  for (const match of String(source).matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);

  const relevantNames = [...names].filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(failureText));
  const functions = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const declaration = new RegExp(`\\bfunction\\s+${escaped}\\s*\\(|\\b(?:const|let|var)\\s+${escaped}\\s*=`);
    const match = declaration.exec(source);
    if (match) functions.push({ name, index: match.index, end: Math.min(source.length, match.index + 1200) });
  }
  functions.sort((a, b) => a.index - b.index);
  const selected = new Set(relevantNames.length ? relevantNames : [...names].slice(0, 8));
  return functions.filter((item) => selected.has(item.name)).map((item) => {
    const next = functions.find((candidate) => candidate.index > item.index);
    return source.slice(item.index, Math.min(item.end, next?.index ?? source.length)).replace(/\s+/g, ' ').trim();
  });
}

async function publish(context) {
  const failureDiagnostics = context.error.failureDiagnostics || buildFailureDiagnostics(context.error);
  const previousDigest = await previousCandidateDigest(context.db, context.mission.agentId);
  failureDiagnostics.candidate.candidateChanged = candidateChanged(previousDigest,
    failureDiagnostics.candidate.candidateDigest);
  const event = emit(context.mission.agentId, 'LOCAL_CODE_TEST_REPAIR', 'TEST_FEEDBACK',
    `Retrying after test failure ${context.failedAttempt}; ${context.remainingMs} ms remain.`, {
      failedAttempt: context.failedAttempt,
      remainingMs: context.remainingMs,
      failureCode: context.error.code || null,
      failureMessage: String(context.error.message || '').slice(0, 1000),
      failureDiagnostics,
      candidateDigest: failureDiagnostics.candidate.candidateDigest,
      candidateChanged: failureDiagnostics.candidate.candidateChanged,
      schemaViolations: context.error.workerArtifactDiagnostics?.violations || [],
      proposalTests: context.error.proposal?.tests,
      failedPatchDiagnostics: summarizeFailedPatches(context.error)
    }, 'warning', 'running');
  await strategyExecution.recordExecutionEvent(context.db, context.mission.agentId, event);
}

module.exports = { publish, summarizeFailedPatches, classifyFailure, controlDiagnostics,
  candidateDiagnostics, buildFailureDiagnostics, candidateChanged };
