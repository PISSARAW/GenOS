/**
 * Politiques planning-gap à budget égal.
 * Même modèle du monde (successeurs + heuristique), seul le contrôle diffère.
 */
const Domain = require('./planningGapDomain');
const { NaturalSearchController } = require('./naturalSearchController');
const { HypothesisLedger, PROVENANCE } = require('./hypothesisLedgerService');
const { NegativeSearchMemory } = require('./negativeSearchMemoryService');

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

function mctsPolicy(task, budgetLimit, maxDepth) {
  const budget = makeBudget(budgetLimit);
  const hooks = domainHooks(task);
  const root = { state: hooks.start(), plan: [], visits: 0, value: 0, children: null };
  while (budget.used < budget.limit) {
    if (!consume(budget, 1)) break;
    const leaf = selectLeaf(root, hooks);
    expandLeaf(leaf, hooks);
    const reward = rolloutLeaf(leaf, hooks, maxDepth);
    backpropLeaf(leaf, reward);
    if (hooks.isGoal(leafBestState(root))) break;
  }
  const plan = extractMctsPlan(root, hooks);
  const v = hooks.verify(plan);
  return { policy: 'mcts', plan, valid: v.valid, expansions: budget.used };
}

function selectLeaf(root, hooks) {
  let node = root;
  while (node.children && node.children.length > 0) {
    node.children.sort((a, b) => b.value / (1 + b.visits) - a.value / (1 + a.visits));
    node = node.children[0];
  }
  return node;
}

function expandLeaf(leaf, hooks) {
  hooks._s = leaf.state;
  const cands = hooks.successors(leaf.state).slice(0, 4);
  hooks._s = leaf.state;
  const ranked = rankByHeuristic(cands, hooks);
  leaf.children = ranked.map((r) => ({
    state: hooks.apply(leaf.state, r.move),
    plan: leaf.plan.concat([r.move.action]),
    visits: 0, value: -r.h, children: null,
  }));
}

function rolloutLeaf(leaf, hooks, maxDepth) {
  let state = leaf.state;
  let best = hooks.heuristic(state);
  for (let i = 0; i < maxDepth; i += 1) {
    if (hooks.isGoal(state)) return 10;
    const cands = hooks.successors(state);
    if (cands.length === 0) return -5;
    hooks._s = state;
    const ranked = rankByHeuristic(cands, hooks);
    state = hooks.apply(state, ranked[0].move);
    if (ranked[0].h < best) best = ranked[0].h;
  }
  return hooks.isGoal(state) ? 10 : -best * 0.1;
}

function backpropLeaf(leaf, reward) {
  leaf.visits += 1;
  leaf.value += reward;
}

function leafBestState(root) {
  if (!root.children || root.children.length === 0) return root.state;
  root.children.sort((a, b) => b.value - a.value);
  return root.children[0].state;
}

function extractMctsPlan(root, hooks) {
  let node = root;
  while (node.children && node.children.length > 0) {
    node.children.sort((a, b) => b.value - a.value);
    node = node.children[0];
    if (hooks.isGoal(node.state)) return node.plan;
  }
  return node.plan;
}

// --- GenOS : contrôleur réel + ledger + mémoire négative ---
function radiusWidth(radius) {
  if (radius === 'minimal') return 1;
  if (radius === 'local') return 2;
  if (radius === 'medium') return 3;
  if (radius === 'structural') return 4;
  return 5;
}

function genosPolicy(task, budgetLimit, agentTag) {
  const budget = makeBudget(budgetLimit);
  const hooks = domainHooks(task);
  const ledger = new HypothesisLedger({});
  const memory = new NegativeSearchMemory();
  const controller = new NaturalSearchController({ ledger });
  const agentId = `${agentTag}-${task.id}`;
  const rootState = hooks.start();
  const beams = [{ state: rootState, plan: [] }];
  const seen = new Set([hooks.key(rootState)]);
  let falsified = 0;
  let stepsNoProgress = 0;
  let bestH = hooks.heuristic(rootState);
  let pressure = 0;
  for (let depth = 0; depth < 14; depth += 1) {
    if (beams.length === 0) break;
    const ctx = buildGenosCtx({ agentId, stepsNoProgress, falsified, budget, bestH });
    const sel = controller.selectProcess(ctx);
    pressure = sel.pressure;
    const width = radiusWidth(sel.recommendedRadius);
    const expanded = expandBeams({ beams, hooks, width, budget, seen, memory, agentId });
    if (expanded.goal) {
      const v = hooks.verify(expanded.goal.plan);
      ledgerRecord({ ledger, agentId, plan: expanded.goal.plan, supported: true });
      return genosResult({ plan: expanded.goal.plan, valid: v.valid, budget, ledger, memory, pressure, process: sel.process });
    }
    if (expanded.next.length === 0) {
      falsified += 1;
      stepsNoProgress += 1;
      recordBlocked({ ledger, memory, agentId, beams });
      if (pressure > 0.8) break;
      continue;
    }
    const improved = trackProgress(expanded.next, hooks, bestH);
    bestH = improved.best;
    stepsNoProgress = improved.steps;
    falsified = improved.falsified;
    beams.length = 0;
    for (const b of expanded.next.slice(0, 4)) beams.push(b);
    ledgerRecord({ ledger, agentId, plan: beams[0].plan, supported: false });
  }
  const v = hooks.verify([]);
  return genosResult({ plan: [], valid: v.valid, budget, ledger, memory, pressure, process: 'none' });
}

function buildGenosCtx(spec) {
  return {
    agentId: spec.agentId,
    searchYield: spec.bestH > 0 ? 1 / (1 + spec.bestH) : 1,
    stepsSinceProgress: spec.stepsNoProgress,
    falsifiedHypotheses: spec.falsified,
    contradictions: 0,
    budgetRatio: spec.budget.used / Math.max(1, spec.budget.limit),
    causalProgressReport: { window: { searchYield: 0 } },
    entropyMetrics: { normalizedEntropy: 0.4 },
  };
}

function expandBeams(spec) {
  const next = [];
  for (const node of spec.beams) {
    if (spec.hooks.isGoal(node.state)) return { goal: node, next };
    if (!consume(spec.budget, 1)) continue;
    spec.hooks._s = node.state;
    const cands = spec.hooks.successors(node.state);
    spec.hooks._s = node.state;
    const ranked = rankByHeuristic(cands, spec.hooks);
    for (const r of ranked.slice(0, spec.width)) {
      const ns = spec.hooks.apply(node.state, r.move);
      const key = spec.hooks.key(ns);
      const stmt = node.plan.concat([r.move.action]).join('>');
      if (spec.seen.has(key)) continue;
      if (spec.memory.isPathBlocked(spec.agentId, stmt)) continue;
      spec.seen.add(key);
      next.push({ state: ns, plan: node.plan.concat([r.move.action]), h: r.h });
    }
  }
  next.sort((a, b) => a.h - b.h);
  const goal = next.find((n) => spec.hooks.isGoal(n.state)) || null;
  return { goal, next };
}

function trackProgress(next, hooks, bestH) {
  let best = bestH;
  let improved = false;
  for (const n of next) {
    if (n.h < best) {
      best = n.h;
      improved = true;
    }
  }
  void hooks;
  if (improved) return { best, steps: 0, falsified: 0 };
  return { best, steps: 1, falsified: 0 };
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

function recordBlocked(spec) {
  for (const b of spec.beams.slice(0, 1)) {
    const h = spec.ledger.propose({ agentId: spec.agentId, statement: b.plan.join('>'), confidence: 0.4 });
    spec.ledger.startTest(h.id);
    spec.memory.recordFailure(spec.agentId, h, { ref: 'dead-end', strength: 0.7, reliability: 0.8 }, { signature: 'planning-gap', conditions: [], scope: 'agent' });
  }
}

function genosResult(spec) {
  return {
    policy: 'genos', plan: spec.plan, valid: spec.valid, expansions: spec.budget.used,
    ledgerSize: spec.ledger.hypotheses.size, negativeTrails: spec.memory.trails.size,
    pressure: spec.pressure, process: spec.process,
  };
}

module.exports = { reactPolicy, totPolicy, mctsPolicy, genosPolicy };
