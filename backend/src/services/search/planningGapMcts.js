'use strict';

const Domain = require('./planningGapDomain');

function makeBudget(limit) {
  return { limit, used: 0 };
}

function consume(budget, n) {
  if (budget.used + n > budget.limit) return false;
  budget.used += n;
  return true;
}

function makeNode(state, plan) {
  return { state, plan, visits: 0, value: 0, children: null, rollouts: 0, totalDepth: 0 };
}

function buildHooks(task) {
  const isBlock = task.domain === 'blocksworld';
  return {
    start: isBlock ? () => ({ stacks: task.init.map(s => s.slice()), hand: null }) : () => ({ x: task.start.x, y: task.start.y, keys: new Set() }),
    successors: isBlock ? Domain.successorsBlockworld : (s) => Domain.trapSuccessors(s, task),
    apply: isBlock ? Domain.applyBlockworld : Domain.applyTrap,
    isGoal: isBlock ? (s) => Domain.isGoalBlockworld(s, task) : (s) => Domain.isGoalTrap(s, task),
    heuristic: isBlock ? (s) => Domain.heuristicBlockworld(s, task) : (s) => Domain.heuristicTrap(s, task),
    verify: isBlock ? (p) => Domain.verifyBlockworld(task, p) : (p) => Domain.verifyTrap(task, p),
  };
}

function uctScore(child, parentVisits) {
  if (child.visits === 0) return Infinity;
  const exploit = child.value / child.visits;
  const explore = 1.4 * Math.sqrt(Math.log(1 + parentVisits) / child.visits);
  return exploit + explore;
}

function mctsSelect(node) {
  const path = [node];
  while (node.children && node.children.length > 0) {
    let best = node.children[0];
    let bestS = uctScore(best, node.visits);
    for (const c of node.children.slice(1)) {
      const s = uctScore(c, node.visits);
      if (s > bestS) { bestS = s; best = c; }
    }
    node = best;
    path.push(node);
  }
  return path;
}

function expandNode(leaf, hooks) {
  if (leaf.children) return;
  const cands = hooks.successors(leaf.state).slice(0, 4);
  const scored = cands.map(c => ({ c, h: hooks.heuristic(hooks.apply(leaf.state, c)) }));
  scored.sort((a, b) => a.h - b.h);
  leaf.children = scored.map(({ c }) => makeNode(hooks.apply(leaf.state, c), leaf.plan.concat([c.action])));
}

function weightedPick(ranked) {
  const half = ranked.slice(0, Math.max(2, Math.ceil(ranked.length / 2)));
  const weights = half.map((_, idx) => 1 / (1 + idx));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < half.length; i++) {
    r -= weights[i];
    if (r <= 0) return half[i];
  }
  return half[0];
}

function rolloutCounted(spec) {
  const hooks = spec.hooks;
  let state = spec.leaf.state;
  let best = hooks.heuristic(state);
  let depth = 0;
  for (let i = 0; i < spec.maxDepth; i++) {
    if (hooks.isGoal(state)) return { reward: 10 - depth * 0.1, depth: i + 1 };
    if (!consume(spec.budget, 1)) break;
    const cands = hooks.successors(state);
    if (cands.length === 0) return { reward: -5, depth: i + 1 };
    const ranked = cands.map(c => ({ c, h: hooks.heuristic(hooks.apply(state, c)) }));
    ranked.sort((a, b) => a.h - b.h);
    const pick = weightedPick(ranked);
    state = hooks.apply(state, pick.c);
    if (pick.h < best) best = pick.h;
    depth = i + 1;
  }
  return hooks.isGoal(state) ? { reward: 10 - depth * 0.1, depth } : { reward: -best * 0.1, depth };
}

function backpropPath(path, reward, depth) {
  for (const n of path) {
    n.visits += 1;
    n.value += reward;
    n.rollouts += 1;
    n.totalDepth += depth;
  }
}

function bestDescendant(node) {
  while (node.children && node.children.length > 0) {
    node.children.sort((a, b) => b.value - a.value);
    node = node.children[0];
  }
  return node.state;
}

function extractBestPlan(node, hooks) {
  while (node.children && node.children.length > 0) {
    node.children.sort((a, b) => {
      const aDepth = a.rollouts > 0 ? a.totalDepth / a.rollouts : 999;
      const bDepth = b.rollouts > 0 ? b.totalDepth / b.rollouts : 999;
      if (Math.abs(b.value - a.value) > 0.01) return b.value - a.value;
      return aDepth - bDepth;
    });
    node = node.children[0];
    if (hooks.isGoal(node.state)) return node.plan;
  }
  return node.plan;
}

function mctsPolicy(task, budgetLimit, maxDepth) {
  const budget = makeBudget(budgetLimit);
  const hooks = buildHooks(task);
  const root = makeNode(hooks.start(), []);
  while (budget.used < budget.limit) {
    if (!consume(budget, 1)) break;
    const path = mctsSelect(root);
    const leaf = path[path.length - 1];
    if (hooks.isGoal(leaf.state)) {
      backpropPath(path, 10 - path.length * 0.05, path.length);
      break;
    }
    expandNode(leaf, hooks);
    const { reward, depth } = rolloutCounted({ leaf, hooks, budget, maxDepth });
    backpropPath(path, reward, depth);
    if (hooks.isGoal(bestDescendant(root))) break;
  }
  const plan = extractBestPlan(root, hooks);
  return { policy: 'mcts', plan, valid: hooks.verify(plan).valid, expansions: budget.used };
}

module.exports = { mctsPolicy, makeBudget, consume };
