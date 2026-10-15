'use strict';

/**
 * Held-out synthetic family: keyed mazes with branch traps and one/two gates.
 * Tasks are deliberately separate from planningGapDomain.buildTasks().
 * Every policy receives the same successor model and expansion budget.
 */
const assert = require('node:assert/strict');
const Policies = require('../../src/services/search/planningGapPolicies');

const BUDGET = 240;
const POLICIES = ['react', 'tot', 'mcts', 'genos'];

function makeMaze(id, spec) {
  return { id, domain: 'heldout-keyed-maze', ...spec,
    walls: new Set(spec.walls), doors: new Map(spec.doors), keysOn: new Map(spec.keysOn) };
}

function heldoutTasks() {
  return [
    makeMaze('hm-01', { w: 8, h: 5, walls: ['3,0', '3,1', '3,3', '3,4'], doors: [['5,2', 'a']], keysOn: [['1,4', 'a']], start: { x: 0, y: 2 }, goal: { x: 7, y: 2 } }),
    makeMaze('hm-02', { w: 8, h: 7, walls: ['2,0', '2,1', '2,2', '2,4', '2,5', '2,6'], doors: [['5,4', 'b']], keysOn: [['0,6', 'b']], start: { x: 0, y: 0 }, goal: { x: 7, y: 6 } }),
    makeMaze('hm-03', { w: 9, h: 7, walls: ['4,0', '4,1', '4,2', '4,4', '4,5', '4,6'], doors: [['4,3', 'c']], keysOn: [['2,6', 'c']], start: { x: 0, y: 3 }, goal: { x: 8, y: 3 } }),
    makeMaze('hm-04', { w: 8, h: 8, walls: ['3,1', '3,2', '3,3', '3,5', '3,6', '3,7'], doors: [['3,4', 'd']], keysOn: [['1,7', 'd']], start: { x: 0, y: 4 }, goal: { x: 7, y: 4 } }),
    makeMaze('hm-05', { w: 9, h: 7, walls: ['3,0', '3,1', '3,2', '3,4', '3,5', '3,6', '6,0', '6,1', '6,2', '6,4', '6,5', '6,6'], doors: [['3,3', 'e'], ['6,3', 'f']], keysOn: [['1,6', 'e'], ['4,6', 'f']], start: { x: 0, y: 3 }, goal: { x: 8, y: 3 } }),
    makeMaze('hm-06', { w: 9, h: 8, walls: ['2,1', '3,1', '4,1', '5,1', '6,1', '2,5', '3,5', '4,5', '5,5', '6,5'], doors: [['7,3', 'g']], keysOn: [['0,7', 'g']], start: { x: 0, y: 0 }, goal: { x: 8, y: 7 } }),
    makeMaze('hm-07', { w: 10, h: 7, walls: ['2,0', '2,1', '2,2', '2,4', '2,5', '2,6', '7,0', '7,1', '7,2', '7,4', '7,5', '7,6'], doors: [['5,3', 'h']], keysOn: [['0,6', 'h']], start: { x: 0, y: 3 }, goal: { x: 9, y: 3 } }),
    makeMaze('hm-08', { w: 10, h: 8, walls: ['4,0', '4,1', '4,2', '4,4', '4,5', '4,6', '1,3', '2,3', '3,3', '6,4', '7,4', '8,4'], doors: [['4,3', 'i']], keysOn: [['0,7', 'i']], start: { x: 0, y: 0 }, goal: { x: 9, y: 7 } }),
  ];
}

function canEnter(spec) {
  const { task, state, x, y } = spec;
  const cell = `${x},${y}`;
  if (x < 0 || y < 0 || x >= task.w || y >= task.h || task.walls.has(cell)) return false;
  const gate = task.doors.get(cell);
  return !gate || state.keys.has(gate);
}

// Independent transition checker: it parses action strings and applies rules directly.
function verify(task, plan) {
  let state = { x: task.start.x, y: task.start.y, keys: new Set() };
  for (const action of plan) {
    state = replayAction(action, state, task);
    if (!state) return false;
  }
  return state.x === task.goal.x && state.y === task.goal.y;
}

function replayAction(action, state, task) {
  if (action.startsWith('pick ')) return replayPickup(action, state, task);
  const delta = { 'go E': [1, 0], 'go W': [-1, 0], 'go S': [0, 1], 'go N': [0, -1] }[action];
  if (!delta) return null;
  const x = state.x + delta[0];
  const y = state.y + delta[1];
  return canEnter({ task, state, x, y }) ? { ...state, x, y } : null;
}

function replayPickup(action, state, task) {
  const key = action.slice(5);
  if (task.keysOn.get(`${state.x},${state.y}`) !== key || state.keys.has(key)) return null;
  return { ...state, keys: new Set([...state.keys, key]) };
}

function runPolicy(policy, task) {
  if (policy === 'react') return Policies.reactPolicy(task, BUDGET, 40);
  if (policy === 'tot') return Policies.totPolicy(task, BUDGET, 3);
  if (policy === 'mcts') return Policies.mctsPolicy(task, BUDGET, 6);
  return Policies.genosPolicy(task, BUDGET, 'heldout');
}

function runHeldout() {
  const tasks = heldoutTasks();
  const scores = Object.fromEntries(POLICIES.map((name) => [name, { solved: 0, expansions: 0 }]));
  console.log(`Held-out keyed-maze family: ${tasks.length} tasks, expansion budget=${BUDGET}`);
  for (const task of tasks) {
    const outcomes = {};
    for (const policy of POLICIES) {
      const result = runPolicy(policy, task);
      assert.ok(result.expansions <= BUDGET, `${task.id}/${policy} budget exceeded`);
      const independentlyValid = verify(task, result.plan);
      assert.equal(result.valid, independentlyValid, `${task.id}/${policy} verifier disagreement`);
      scores[policy].solved += Number(independentlyValid);
      scores[policy].expansions += result.expansions;
      outcomes[policy] = independentlyValid ? 1 : 0;
    }
    console.log(`${task.id}: ${POLICIES.map((p) => `${p}=${outcomes[p]}`).join(' ')}`);
  }
  for (const policy of POLICIES) {
    const row = scores[policy];
    row.meanExpansions = Number((row.expansions / tasks.length).toFixed(1));
    console.log(`${policy}: ${row.solved}/${tasks.length}, mean expansions=${row.meanExpansions}`);
  }
  return scores;
}

if (require.main === module) runHeldout();
module.exports = { runHeldout, heldoutTasks, verify, BUDGET };
