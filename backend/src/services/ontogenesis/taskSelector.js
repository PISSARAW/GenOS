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
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function isDepDone(dep, byId) {
  const found = byId.get(dep);
  return Boolean(found) && found.status === 'done';
}

function isRunnable(task, byId) {
  if (task.status !== 'todo') return false;
  if (task.attempt >= MAX_ATTEMPTS) return false;
  return parseDeps(task).every((dep) => isDepDone(dep, byId));
}

function topPriority(runnable) {
  return runnable.slice().sort(comparePriority)[0];
}

function comparePriority(left, right) {
  return right.priority - left.priority;
}

function blockedReason(tasks) {
  if (tasks.some((task) => task.status === 'todo' && task.attempt >= MAX_ATTEMPTS)) {
    return 'tentatives-epuisees';
  }
  if (tasks.some((task) => task.status === 'todo')) return 'dependances-manquantes';
  if (tasks.some((task) => task.status === 'doing')) return 'execution-en-cours';
  return 'backlog-vide';
}

function selectNextTask(tasks) {
  const rows = tasks || [];
  const byId = new Map(rows.map((task) => [task.id, task]));
  const runnable = rows.filter((task) => isRunnable(task, byId));
  if (runnable.length > 0) return { task: topPriority(runnable) };
  return { blocked: blockedReason(rows) };
}

module.exports = { MAX_ATTEMPTS, selectNextTask };
