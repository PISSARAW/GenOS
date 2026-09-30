'use strict';

/**
 * Politiques planning-gap à budget égal.
 * Même modèle du monde (successeurs + heuristique), seul le contrôle diffère.
 */
const Domain = require('./planningGapDomain');
const { NaturalSearchController } = require('./naturalSearchController');
const { HypothesisLedger, PROVENANCE } = require('./hypothesisLedgerService');
const { NegativeSearchMemory } = require('./negativeSearchMemoryService');
const { mctsPolicy } = require('./planningGapMcts');

function makeBudget(limit) {
  return { limit, used: 0 };
}

function consume(budget, n) {
  if (budget.used + n > budget.limit) return false;
  budget.used += n;
  return true;
}

function domainHooks(task) {
  if (task.domain === 'blocksworld') {
    return {
      start: () => ({ stacks: task.init.map((s) => s.slice()), hand: null }),
      successors: Domain.successorsBlockworld,
      apply: Domain.applyBlockworld,
      isGoal: (s) => Domain.isGoalBlockworld(s, task),
      heuristic: (s) => Domain.heuristicBlockworld(s, task),
      verify: (p) => Domain.verifyBlockworld(task, p),
      key: Domain.stateKey,
    };
  }
  return {
    start: () => ({ x: task.start.x, y: task.start.y, keys: new Set() }),
    successors: (s) => Domain.trapSuccessors(s, task),
    apply: Domain.applyTrap,
    isGoal: (s) => Domain.isGoalTrap(s, task),
    heuristic: (s) => Domain.heuristicTrap(s, task),
    verify: (p) => Domain.verifyTrap(task, p),
    key: Domain.trapKey,
  };
}

function rankByHeuristic(cands, hooks) {
  const scored = cands.map((c) => ({ move: c, h: hooks.heuristic(hooks.apply(hooks._s, c)) }));
  scored.sort((a, b) => a.h - b.h);
  return scored;
}

function reactPolicy(task, budgetLimit, maxSteps) {
  const budget = makeBudget(budgetLimit);
  const hooks = domainHooks(task);
  let state = hooks.start();
  hooks._s = state;
  const plan = [];
  const seen = new Set([hooks.key(state)]);
  for (let step = 0; step < maxSteps; step += 1) {
    if (hooks.isGoal(state)) break;
    if (!consume(budget, 1)) break;
    const cands = hooks.successors(state);
    if (cands.length === 0) break;
    hooks._s = state;
    const ranked = rankByHeuristic(cands, hooks);
    const pick = pickUnseen(ranked, hooks, seen);
    if (!pick) break;
    plan.push(pick.move.action);
    state = hooks.apply(state, pick.move);
    seen.add(hooks.key(state));
  }
  const v = hooks.verify(plan);
  return { policy: 'react', plan, valid: v.valid, expansions: budget.used };
}

function pickUnseen(ranked, hooks, seen) {
  for (const r of ranked) {
    const next = hooks.apply(hooks._s, r.move);
    if (!seen.has(hooks.key(next))) return r;
  }
  return ranked[0] || null;
}

function totPolicy(task, budgetLimit, width) {
  const budget = makeBudget(budgetLimit);
  const hooks = domainHooks(task);
  let frontier = [{ state: hooks.start(), plan: [] }];
  const seen = new Set();
  for (let depth = 0; depth < 14; depth += 1) {
    const nextFrontier = [];
    for (const node of frontier) {
      if (hooks.isGoal(node.state)) {
        const v = hooks.verify(node.plan);
        return { policy: 'tot', plan: node.plan, valid: v.valid, expansions: budget.used };
      }
      if (!consume(budget, 1)) return totResult(hooks, frontier, budget);
      hooks._s = node.state;
      const cands = hooks.successors(node.state);
      const ranked = rankByHeuristic(cands, hooks);
      for (const r of ranked.slice(0, width)) {
        const ns = hooks.apply(node.state, r.move);
        const key = hooks.key(ns);
        if (seen.has(key)) continue;
        seen.add(key);
        nextFrontier.push({ state: ns, plan: node.plan.concat([r.move.action]), h: r.h });
      }
    }
    if (nextFrontier.length === 0) break;
    nextFrontier.sort((a, b) => a.h - b.h);
    frontier = nextFrontier.slice(0, width * 2);
  }
  return totResult(hooks, frontier, budget);
}

function totResult(hooks, frontier, budget) {
  const goals = frontier.filter((n) => hooks.isGoal(n.state));
  const plan = goals.length > 0 ? goals[0].plan : [];
  const v = hooks.verify(plan);
  return { policy: 'tot', plan, valid: v.valid, expansions: budget.used };
}

// --- GenOS : coût de chemin, heuristique admissible, contrôleur et ledger ---
function genosPolicy(task, budgetLimit, agentTag) {
  const budget = makeBudget(budgetLimit);
  const hooks = domainHooks(task);
  const ledger = new HypothesisLedger({});
  const memory = new NegativeSearchMemory();
  const controller = new NaturalSearchController({ ledger, pressure: { stagnationWindow: 2, inertia: 0.3, lowYieldThreshold: 0.12 } });
  const agentId = `${agentTag}-${task.id}`;
  const initial = { state: hooks.start(), plan: [], cost: 0 };
  initial.h = hooks.heuristic(initial.state);
  const frontier = [initial];
  const bestCost = new Map([[hooks.key(initial.state), 0]]);
  let falsified = 0;
  let stepsNoProgress = 0;
  let bestH = initial.h;
  let pressure = 0;
  while (frontier.length > 0 && consume(budget, 1)) {
    const ctx = buildGenosCtx({ agentId, stepsNoProgress, falsified, budget, yield: stepsNoProgress === 0 ? 0.5 : 0 });
    const sel = controller.selectProcess(ctx);
    pressure = sel.pressure;
    frontier.sort((a, b) => a.cost + a.h - b.cost - b.h || a.h - b.h || a.cost - b.cost);
    const node = frontier.shift();
    if (hooks.isGoal(node.state)) {
      const verification = hooks.verify(node.plan);
      ledgerRecord({ ledger, agentId, plan: node.plan, supported: verification.valid });
      return genosResult({ plan: node.plan, valid: verification.valid, budget, ledger, memory, pressure, process: sel.process });
    }
    hooks._s = node.state;
    for (const move of hooks.successors(node.state)) enqueueSearchNode({ move, node, hooks, frontier, bestCost });
    if (node.h < bestH) { bestH = node.h; stepsNoProgress = 0; }
    else { stepsNoProgress += 1; falsified += 1; }
  }
  return genosResult({ plan: [], valid: hooks.verify([]).valid, budget, ledger, memory, pressure, process: 'none' });
}

function enqueueSearchNode(spec) {
  const state = spec.hooks.apply(spec.node.state, spec.move);
  const key = spec.hooks.key(state);
  const cost = spec.node.cost + 1;
  if (spec.bestCost.has(key) && spec.bestCost.get(key) <= cost) return;
  spec.bestCost.set(key, cost);
  spec.frontier.push({ state, plan: spec.node.plan.concat([spec.move.action]), cost, h: spec.hooks.heuristic(state) });
}

function buildGenosCtx(spec) {
  return {
    agentId: spec.agentId,
    searchYield: spec.yield !== undefined ? spec.yield : 0.0,
    stepsSinceProgress: spec.stepsNoProgress,
    falsifiedHypotheses: spec.falsified,
    contradictions: 0,
    budgetRatio: spec.budget.used / Math.max(1, spec.budget.limit),
    causalProgressReport: { window: { searchYield: 0 } },
    entropyMetrics: { normalizedEntropy: 0.4 },
  };
}

function ledgerRecord(spec) {
  const h = spec.ledger.propose({ agentId: spec.agentId, statement: spec.plan.join('>') || 'empty', confidence: 0.5 });
  spec.ledger.startTest(h.id);
  spec.ledger.addEvidence(h.id, {
    direction: spec.supported ? 'for' : 'against',
    strength: spec.supported ? 0.9 : 0.3,
    provenance: PROVENANCE.OBSERVED,
    reliability: 0.8,
    independent: true,
    evidenceRef: spec.supported ? 'goal-verified' : 'search-step',
  });
}

function genosResult(spec) {
  return {
    policy: 'genos', plan: spec.plan, valid: spec.valid, expansions: spec.budget.used,
    ledgerSize: spec.ledger.hypotheses.size, negativeTrails: spec.memory.trails.size,
    pressure: spec.pressure, process: spec.process,
  };
}

module.exports = { reactPolicy, totPolicy, mctsPolicy, genosPolicy };
