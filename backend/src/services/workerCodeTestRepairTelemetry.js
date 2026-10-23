'use strict';

const strategyExecution = require('./strategyExecutionService');
const { emit } = require('./agentOrchestrationState');

function summarizeFailedPatches(error) {
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
    return { path: patch.path, bytes: Buffer.byteLength(source, 'utf8'), controls, roles,
      logic: logic.slice(0, 8) };
  });
}

async function publish(context) {
  const event = emit(context.mission.agentId, 'LOCAL_CODE_TEST_REPAIR', 'TEST_FEEDBACK',
    `Retrying after test failure ${context.failedAttempt}; ${context.remainingMs} ms remain.`, {
      failedAttempt: context.failedAttempt,
      remainingMs: context.remainingMs,
      proposalTests: context.error.proposal?.tests,
      failedPatchDiagnostics: summarizeFailedPatches(context.error)
    }, 'warning', 'running');
  await strategyExecution.recordExecutionEvent(context.db, context.mission.agentId, event);
}

module.exports = { publish, summarizeFailedPatches };
