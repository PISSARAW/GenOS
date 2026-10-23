'use strict';

/**
 * Sélection déterministe de la prochaine tâche (ADR 0235).
 * Pur : respecte dépendances, priorité et borne les tentatives.
 * Une tâche épuisée ne replanifie jamais seule.
 */

const MAX_ATTEMPTS = 3;

function parseDeps(task) {
  try {
    const value = JSON.parse(task.depends_on_json || '[]');
    if (!Array.isArray(value)) return { deps: [], corrupt: true };
    return { deps: value, corrupt: false };
  } catch (_) {
    return { deps: [], corrupt: true };
  }
}

function isCorrupt(task) {
  return task.status === 'todo' && parseDeps(task).corrupt;
}

function isDepDone(dep, byId) {
  const found = byId.get(dep);
  return Boolean(found) && found.status === 'done';
}

function normalizedMaxAttempts(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= 10 ? value : MAX_ATTEMPTS;
}

function isRunnable(task, byId, maxAttempts) {
  if (task.status !== 'todo') return false;
  if (task.attempt >= maxAttempts) return false;
  const parsed = parseDeps(task);
  if (parsed.corrupt) return false;
  return parsed.deps.every((dep) => isDepDone(dep, byId));
}

function topPriority(runnable) {
  return runnable.slice().sort(comparePriority)[0];
}

function comparePriority(left, right) {
  const rightPriority = Number.isFinite(right?.priority) ? right.priority : 0;
  const leftPriority = Number.isFinite(left?.priority) ? left.priority : 0;
  if (rightPriority !== leftPriority) return rightPriority - leftPriority;
  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function blockedReason(tasks, maxAttempts) {
  if (tasks.some((task) => task.status === 'todo' && task.attempt >= maxAttempts)) {
    return 'tentatives-epuisees';
  }
  if (tasks.some(isCorrupt)) return 'dependances-invalides';
  if (tasks.some((task) => task.status === 'todo')) return 'dependances-manquantes';
  if (tasks.some((task) => task.status === 'doing')) return 'execution-en-cours';
  if (tasks.some((task) => task.status === 'blocked')) return 'taches-bloquees';
  return 'backlog-vide';
}

function selectNextTask(tasks, options = {}) {
  const rows = tasks || [];
  const maxAttempts = normalizedMaxAttempts(options.maxAttempts);
  const byId = new Map(rows.map((task) => [task.id, task]));
  const runnable = rows.filter((task) => isRunnable(task, byId, maxAttempts));
  if (runnable.length > 0) return { task: topPriority(runnable) };
  return { blocked: blockedReason(rows, maxAttempts) };
}

module.exports = { MAX_ATTEMPTS, normalizedMaxAttempts, selectNextTask };
