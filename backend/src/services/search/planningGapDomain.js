/**
 * Domaine planning-gap : Blocksworld + TrapChain, vérificateur indépendant.
 * Même modèle du monde pour toutes les politiques (même LLM surrogate).
 */
function cloneStacks(stacks) {
  return stacks.map((s) => s.slice());
}

function stateKey(state) {
  const stacks = cloneStacks(state.stacks);
  stacks.sort();
  return JSON.stringify({ stacks, hand: state.hand });
}

function findBlock(state, block) {
  if (state.hand === block) return { where: 'hand' };
  for (let i = 0; i < state.stacks.length; i += 1) {
    const idx = state.stacks[i].indexOf(block);
    if (idx >= 0) return { where: 'stack', stack: i, index: idx };
  }
  return null;
}

function isClear(state, block) {
  const pos = findBlock(state, block);
  if (!pos) return false;
  if (pos.where === 'hand') return true;
  const stack = state.stacks[pos.stack];
  return pos.index === stack.length - 1;
}

function topOf(stack) {
  return stack.length === 0 ? null : stack[stack.length - 1];
}

function successorsBlockworld(state) {
  const out = [];
  if (state.hand) {
    const h = state.hand;
    for (let i = 0; i < state.stacks.length; i += 1) {
      const target = topOf(state.stacks[i]);
      if (target === null || isClear(state, target)) {
        out.push({ action: `stack ${h} on ${target || 'table'}`, kind: 'stack', block: h, dest: i });
      }
    }
    out.push({ action: `putdown ${h}`, kind: 'putdown', block: h, dest: -1 });
    return out;
  }
  for (let i = 0; i < state.stacks.length; i += 1) {
    const top = topOf(state.stacks[i]);
    if (top) out.push({ action: `unstack ${top}`, kind: 'unstack', block: top, src: i });
  }
  return out;
}

function applyBlockworld(state, move) {
  const next = { stacks: cloneStacks(state.stacks), hand: state.hand };
  if (move.kind === 'unstack') {
    const stack = next.stacks[move.src];
    next.hand = stack.pop();
  } else if (move.kind === 'putdown') {
    next.stacks.push([next.hand]);
    next.hand = null;
  } else if (move.kind === 'stack') {
    if (move.dest === -1) next.stacks.push([next.hand]);
    else next.stacks[move.dest].push(next.hand);
    next.hand = null;
  }
  next.stacks = next.stacks.filter((s) => s.length > 0);
  return next;
}

function goalSignature(goalStacks) {
  const sorted = goalStacks.map((s) => s.slice()).sort();
  return JSON.stringify(sorted);
}

function isGoalBlockworld(state, task) {
  if (state.hand) return false;
  const cur = state.stacks.map((s) => s.slice()).sort();
  return JSON.stringify(cur) === goalSignature(task.goal);
}

function heuristicBlockworld(state, task) {
  let bad = 0;
  for (const gStack of task.goal) {
    for (let i = 0; i < gStack.length; i += 1) {
      const b = gStack[i];
      const pos = findBlock(state, b);
      if (!pos || pos.where === 'hand') bad += 2;
      else if (pos.index !== i) bad += 1;
    }
  }
  if (state.hand) bad += 1;
  return bad;
}

function verifyBlockworld(task, plan) {
  let state = { stacks: cloneStacks(task.init), hand: null };
  for (const action of plan) {
    const cands = successorsBlockworld(state);
    const move = cands.find((c) => c.action === action);
    if (!move) return { valid: false, reason: `illegal:${action}` };
    state = applyBlockworld(state, move);
  }
  const ok = isGoalBlockworld(state, task);
  return { valid: ok, reason: ok ? 'goal' : 'not-goal' };
}

function bfsOptimal(task, limit) {
  const start = { stacks: cloneStacks(task.init), hand: null };
  const queue = [{ state: start, plan: [] }];
  const seen = new Set([stateKey(start)]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (isGoalBlockworld(cur.state, task)) return cur.plan;
    if (cur.plan.length >= 14) continue;
    if (seen.size > limit) break;
    for (const m of successorsBlockworld(cur.state)) {
      const next = applyBlockworld(cur.state, m);
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ state: next, plan: cur.plan.concat([m.action]) });
    }
  }
  return null;
}

// --- TrapChain : grille avec leurre local ---
function cellBlocked(spec) {
  if (spec.nx < 0 || spec.ny < 0 || spec.nx >= spec.task.w || spec.ny >= spec.task.h) return true;
  if (spec.task.walls.has(spec.cell)) return true;
  if (spec.task.doors.has(spec.cell) && !spec.state.keys.has(spec.task.doors.get(spec.cell))) return true;
  return false;
}

function collectMoves(task, state) {
  const dirs = [[1, 0, 'E'], [-1, 0, 'W'], [0, 1, 'S'], [0, -1, 'N']];
  const out = [];
  for (const d of dirs) {
    const nx = state.x + d[0];
    const ny = state.y + d[1];
    const cell = `${nx},${ny}`;
    if (cellBlocked({ task, state, cell, nx, ny })) continue;
    out.push({ action: `go ${d[2]}`, kind: 'go', nx, ny });
  }
  return out;
}

function collectPickup(task, state, out) {
  const cell = `${state.x},${state.y}`;
  if (task.keysOn.has(cell) && !state.keys.has(task.keysOn.get(cell))) {
    out.push({ action: `pick ${task.keysOn.get(cell)}`, kind: 'pick', key: task.keysOn.get(cell) });
  }
  return out;
}

function trapSuccessors(state, task) {
  const out = collectMoves(task, state);
  return collectPickup(task, state, out);
}

function applyTrap(state, move) {
  const next = { x: state.x, y: state.y, keys: new Set(state.keys) };
  if (move.kind === 'go') {
    next.x = move.nx;
    next.y = move.ny;
  }
  if (move.kind === 'pick') next.keys.add(move.key);
  return next;
}

function trapKey(state) {
  return `${state.x},${state.y}|${Array.from(state.keys).sort().join(',')}`;
}

function isGoalTrap(state, task) {
  return state.x === task.goal.x && state.y === task.goal.y;
}

function heuristicTrap(state, task) {
  return Math.abs(state.x - task.goal.x) + Math.abs(state.y - task.goal.y);
}

function verifyTrap(task, plan) {
  let state = { x: task.start.x, y: task.start.y, keys: new Set() };
  for (const action of plan) {
    const cands = trapSuccessors(state, task);
    const move = cands.find((c) => c.action === action);
    if (!move) return { valid: false, reason: `illegal:${action}` };
    state = applyTrap(state, move);
  }
  const ok = isGoalTrap(state, task);
  return { valid: ok, reason: ok ? 'goal' : 'not-goal' };
}

function makeBlockTask(spec) {
  return { id: spec.id, domain: 'blocksworld', init: spec.init, goal: spec.goal, family: spec.family };
}

function makeTrapTask(spec) {
  return { id: spec.id, domain: 'trapchain', ...spec.base, family: spec.family };
}

function buildTasks() {
  const tasks = [];
  tasks.push(makeBlockTask({ id: 'bw-sussman', init: [['C'], ['A', 'B']], goal: [['A', 'B', 'C']], family: 'sussman' }));
  tasks.push(makeBlockTask({ id: 'bw-sussman-4', init: [['D'], ['A', 'B', 'C']], goal: [['A', 'B', 'C', 'D']], family: 'sussman' }));
  tasks.push(makeBlockTask({ id: 'bw-reverse-4', init: [['A', 'B', 'C', 'D']], goal: [['D', 'C', 'B', 'A']], family: 'reversal' }));
  tasks.push(makeBlockTask({ id: 'bw-swap', init: [['A', 'B'], ['C', 'D']], goal: [['A', 'C'], ['B', 'D']], family: 'swap' }));
  tasks.push(makeBlockTask({ id: 'bw-tower-5', init: [['E'], ['D'], ['C'], ['B'], ['A']], goal: [['A', 'B', 'C', 'D', 'E']], family: 'tower' }));
  tasks.push(makeBlockTask({ id: 'bw-conflict', init: [['A', 'C'], ['B']], goal: [['A', 'B', 'C']], family: 'conflict' }));
  tasks.push(makeBlockTask({ id: 'bw-table-6', init: [['A', 'F'], ['B', 'E'], ['C', 'D']], goal: [['A', 'B', 'C', 'D', 'E', 'F']], family: 'tower' }));
  tasks.push(makeBlockTask({ id: 'bw-detour', init: [['B', 'A'], ['C']], goal: [['A', 'B', 'C']], family: 'detour' }));
  const trapBase = { w: 7, h: 5, walls: new Set(['3,0', '3,1', '3,3', '3,4']), doors: new Map([['5,2', 'k1']]), keysOn: new Map([['1,4', 'k1']]), start: { x: 0, y: 2 }, goal: { x: 6, y: 2 } };
  tasks.push(makeTrapTask({ id: 'trap-key-detour', base: trapBase, family: 'key-detour' }));
  const trap2 = { w: 6, h: 6, walls: new Set(['2,0', '2,1', '2,2', '2,4', '2,5']), doors: new Map([['4,3', 'k2']]), keysOn: new Map([['0,5', 'k2']]), start: { x: 0, y: 0 }, goal: { x: 5, y: 5 } };
  tasks.push(makeTrapTask({ id: 'trap-long-detour', base: trap2, family: 'key-detour' }));
  const trap3 = { w: 5, h: 5, walls: new Set(['1,1', '2,1', '3,1']), doors: new Map(), keysOn: new Map(), start: { x: 0, y: 0 }, goal: { x: 4, y: 4 } };
  tasks.push(makeTrapTask({ id: 'trap-culdesac', base: trap3, family: 'decoy' }));
  const trap4 = { w: 7, h: 7, walls: new Set(['3,0', '3,1', '3,2', '3,4', '3,5', '3,6']), doors: new Map([['3,3', 'k3']]), keysOn: new Map([['6,6', 'k3']]), start: { x: 0, y: 3 }, goal: { x: 6, y: 3 } };
  tasks.push(makeTrapTask({ id: 'trap-far-key', base: trap4, family: 'key-detour' }));
  return tasks;
}

module.exports = {
  successorsBlockworld,
  applyBlockworld,
  isGoalBlockworld,
  heuristicBlockworld,
  verifyBlockworld,
  bfsOptimal,
  trapSuccessors,
  applyTrap,
  trapKey,
  isGoalTrap,
  heuristicTrap,
  verifyTrap,
  buildTasks,
  stateKey,
};
