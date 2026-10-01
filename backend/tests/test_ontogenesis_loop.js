'use strict';

const assert = require('assert');
const machine = require('../src/services/ontogenesis/stateMachine');
const selector = require('../src/services/ontogenesis/taskSelector');
const controller = require('../src/services/ontogenesis/loopController');
const wakeup = require('../src/services/ontogenesis/wakeupPolicy');

// Machine : la ressource endort depuis chaque état actif.
assert.strictEqual(machine.nextState('PLANNING', 'resource'), 'SLEEPING_RESOURCE');
assert.strictEqual(machine.nextState('VERIFYING', 'resource'), 'SLEEPING_RESOURCE');
assert.strictEqual(machine.nextState('INTEGRATING', 'resource'), 'SLEEPING_RESOURCE');
assert.strictEqual(machine.allowsAutoWake('PAUSED'), false);
assert.strictEqual(machine.allowsAutoWake('SLEEPING_RESOURCE'), true);
assert.strictEqual(machine.nextState('PAUSED', 'resumed'), 'PLANNING');

// Sélecteur : priorité, dépendances, borne de tentatives.
const ready = selector.selectNextTask([
  { id: 'a', status: 'todo', priority: 1, attempt: 0, depends_on_json: '[]' },
  { id: 'b', status: 'todo', priority: 5, attempt: 0, depends_on_json: '["a"]' }
]);
assert.strictEqual(ready.task.id, 'a', 'la dépendance bloque la priorité');
const afterDep = selector.selectNextTask([
  { id: 'a', status: 'done', priority: 1, attempt: 0, depends_on_json: '[]' },
  { id: 'b', status: 'todo', priority: 5, attempt: 0, depends_on_json: '["a"]' }
]);
assert.strictEqual(afterDep.task.id, 'b');
const exhausted = selector.selectNextTask([
  { id: 'a', status: 'todo', priority: 9, attempt: 3, depends_on_json: '[]' }
]);
assert.strictEqual(exhausted.blocked, 'tentatives-epuisees');
assert.strictEqual(selector.selectNextTask([]).blocked, 'backlog-vide');

// Boucle : planification, budgets, ressources, contrôle.
const dispatch = controller.stepLoop({
  state: 'PLANNING', controlMode: 'running', memoryLevel: 'normal',
  budgetsOk: true, selection: { task: { id: 'a' } }
});
assert.strictEqual(dispatch.event, 'dispatch');
const noBudget = controller.stepLoop({
  state: 'PLANNING', controlMode: 'running', memoryLevel: 'normal',
  budgetsOk: false, selection: { task: { id: 'a' } }
});
assert.deepStrictEqual(noBudget, { event: 'wait', effects: ['notify-blocked:budgets-epuises'] });
const constrained = controller.stepLoop({
  state: 'PLANNING', controlMode: 'running', memoryLevel: 'constrained',
  budgetsOk: true, selection: { task: { id: 'a' } }
});
assert.strictEqual(constrained.hold, true);
const critical = controller.stepLoop({
  state: 'VERIFYING', controlMode: 'running', memoryLevel: 'critical',
  budgetsOk: true, proofsOk: true
});
assert.strictEqual(critical.event, 'resource');
const paused = controller.stepLoop({
  state: 'EXECUTING', controlMode: 'paused', memoryLevel: 'normal', budgetsOk: true
});
assert.strictEqual(paused.event, 'paused');

// Boucle : exécution, vérification sans preuves refusée, intégration.
assert.strictEqual(controller.stepLoop({ state: 'EXECUTING', controlMode: 'running', memoryLevel: 'normal' }).hold, true);
assert.strictEqual(controller.stepLoop({ state: 'EXECUTING', controlMode: 'running', memoryLevel: 'normal', workerResult: 'done' }).event, 'finished');
const unverified = controller.stepLoop({ state: 'VERIFYING', controlMode: 'running', memoryLevel: 'normal', proofsOk: false });
assert.deepStrictEqual(unverified, { event: 'failed', effects: ['bump-attempt', 'record-failure'] });
const conflict = controller.stepLoop({ state: 'INTEGRATING', controlMode: 'running', memoryLevel: 'normal', integration: 'conflict' });
assert.strictEqual(conflict.event, 'wait');
assert.ok(conflict.effects.includes('create-resolution-task'));

// Réveil : pause manuelle jamais automatique, ressource stable seulement.
assert.strictEqual(wakeup.shouldWake('PAUSED', { type: 'user_reply' }).wake, false);
assert.strictEqual(wakeup.shouldWake('SLEEPING_RESOURCE', { type: 'resource', stable: true }).wake, true);
assert.strictEqual(wakeup.shouldWake('SLEEPING_RESOURCE', { type: 'git' }).wake, false);

console.log('ontogenesis loop checks passed.');
