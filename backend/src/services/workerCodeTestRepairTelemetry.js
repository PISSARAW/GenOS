'use strict';

const strategyExecution = require('./strategyExecutionService');
const { emit } = require('./agentOrchestrationState');

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
  const event = emit(context.mission.agentId, 'LOCAL_CODE_TEST_REPAIR', 'TEST_FEEDBACK',
    `Retrying after test failure ${context.failedAttempt}; ${context.remainingMs} ms remain.`, {
      failedAttempt: context.failedAttempt,
      remainingMs: context.remainingMs,
      failureCode: context.error.code || null,
      failureMessage: String(context.error.message || '').slice(0, 1000),
      schemaViolations: context.error.workerArtifactDiagnostics?.violations || [],
      proposalTests: context.error.proposal?.tests,
      failedPatchDiagnostics: summarizeFailedPatches(context.error)
    }, 'warning', 'running');
  await strategyExecution.recordExecutionEvent(context.db, context.mission.agentId, event);
}

module.exports = { publish, summarizeFailedPatches };
