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
  const controller = new NaturalSearchController({ ledger, pressure: { stagnationWindow: 2, inertia: 0.3, lowYieldThreshold: 0.12 } });
  const agentId = `${agentTag}-${task.id}`;
  const rootState = hooks.start();
  const beams = [{ state: rootState, plan: [] }];
  const seen = new Set([hooks.key(rootState)]);
  let falsified = 0;
  let stepsNoProgress = 0;
  let bestH = hooks.heuristic(rootState);
  let pressure = 0;
  let improvedLast = false;
  const track = { checkpoint: beams[0], checkpointH: bestH };
  for (let depth = 0; depth < 14; depth += 1) {
    if (beams.length === 0) break;
    const stagnated = Math.min(2, Math.max(0, stepsNoProgress - 2));
    const ctx = buildGenosCtx({ agentId, stepsNoProgress, falsified: falsified + stagnated, budget, yield: Number(improvedLast) * 0.5 });
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
      const stop = rewindBeams({ ledger, memory, agentId, beams, checkpoint: track.checkpoint, pressure, falsified });
      if (stop) break;
      continue;
    }
    const improved = trackProgress({ next: expanded.next, bestH, steps: stepsNoProgress, falsified });
    bestH = improved.best;
    stepsNoProgress = improved.steps;
    falsified = improved.falsified;
    improvedLast = improved.steps === 0;
    trackCheckpoint(track, expanded.next);
    refillBeams({ beams, next: expanded.next, width, ledger, agentId });
  }
  const v = hooks.verify([]);
  return genosResult({ plan: [], valid: v.valid, budget, ledger, memory, pressure, process: 'none' });
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
      const candPlan = node.plan.concat([r.move.action]);
      if (spec.seen.has(key)) continue;
      if (node.plan.length < 2 && isPrefixBlocked({ memory: spec.memory, agentId: spec.agentId, plan: candPlan })) continue;
      spec.seen.add(key);
      next.push({ state: ns, plan: candPlan, h: r.h });
    }
  }
  next.sort((a, b) => a.h - b.h);
  const goal = next.find((n) => spec.hooks.isGoal(n.state)) || null;
  return { goal, next };
}

function prefixOf(plan) {
  return plan.slice(0, 2).join('>');
}

function isPrefixBlocked(spec) {
  const pref = prefixOf(spec.plan);
  if (!pref || pref === '>') return false;
  const trails = spec.memory.getActiveTrails(spec.agentId);
  for (const t of trails) {
    const tp = prefixOf(String(t.statement || '').split('>'));
    if (tp && tp === pref) {
      return true;
    }
  }
  return false;
}

function recordPrefixFailure(spec) {
  const pref = prefixOf(spec.plan);
  if (!pref || pref === '>') return;
  const hDelta = spec.prevH !== undefined ? spec.prevH - spec.currentH : 0;
  const sig = `prefix:${pref}|dh=${hDelta.toFixed(2)}`;
  const h = spec.ledger.propose({ agentId: spec.agentId, statement: sig, confidence: 0.4 });
  spec.ledger.startTest(h.id);
  spec.memory.recordFailure(spec.agentId, h,
    { ref: 'prefix-dead-end', strength: 0.7, reliability: 0.8 },
    { signature: 'planning-gap', conditions: [`prefix=${pref}`, `dh=${hDelta.toFixed(2)}`], scope: 'agent' }
  );
}

function selectDiverse(sorted, width) {
  if (width <= 1 || sorted.length <= width) return sorted.slice(0, Math.max(1, width));
  const head = sorted.slice(0, width - 1);
  const tail = sorted.slice(width - 1);
  if (tail.length === 0) return head;
  // Novelty pick: candidate with largest mean h-distance from head picks
  const headH = head.map(n => n.h);
  let bestNovel = tail[0];
  let bestDist = -1;
  for (const cand of tail) {
    const meanDist = headH.reduce((sum, h) => sum + Math.abs(cand.h - h), 0) / headH.length;
    if (meanDist > bestDist) {
      bestDist = meanDist;
      bestNovel = cand;
    }
  }
  head.push(bestNovel);
  return head;
}

function trackProgress(spec) {
  let best = spec.bestH;
  let improved = false;
  for (const n of spec.next) {
    if (n.h < best) {
      best = n.h;
      improved = true;
    }
  }
  if (improved) return { best, steps: 0, falsified: 0 };
  return { best, steps: spec.steps + 1, falsified: spec.falsified };
}

function rewindBeams(spec) {
  // True rewind: record ALL beam prefixes as negative knowledge with delta-h
  for (const b of spec.beams) {
    recordPrefixFailure({ ledger: spec.ledger, memory: spec.memory, agentId: spec.agentId,
      plan: b.plan, prevH: b.h !== undefined ? b.h : spec.bestH, currentH: spec.bestH });
  }
  spec.beams.length = 0;
  spec.beams.push(spec.checkpoint);
  if (spec.pressure > 0.8 && spec.falsified >= 2) return true;
  return false;
}

function trackCheckpoint(track, next) {
  if (next[0].h < track.checkpointH) {
    track.checkpointH = next[0].h;
    track.checkpoint = next[0];
  }
}
function refillBeams(spec) {
  const diverse = selectDiverse(spec.next, Math.max(spec.width, 2));
  spec.beams.length = 0;
  for (const b of diverse.slice(0, 6)) spec.beams.push(b);
  ledgerRecord({ ledger: spec.ledger, agentId: spec.agentId, plan: spec.beams[0].plan, supported: false });
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
