const { getDatabase } = require('../../../db');
const telemetry = require('../../telemetryObserver');

function detectSequentialCycle(sequence, maxRepeats) {
  if (sequence.length < 2) return { hasCycle: false };
  for (let period = 1; period <= Math.min(4, Math.floor(sequence.length / 2)); period++) {
    let repeated = 0;
    for (let i = sequence.length - 1; i >= period; i -= period) {
      let match = true;
      for (let k = 0; k < period; k++) {
        if (sequence[i - k] !== sequence[i - k - period]) { match = false; break; }
      }
      if (match) repeated++;
      else break;
    }
    if (repeated >= maxRepeats) {
      const detectedCycle = sequence.slice(sequence.length - period);
      const cycleParticipants = [...new Set(detectedCycle)];
      const loopType = period === 1 ? 'repetitive_action' : 'agent_ping_pong';
      return { hasCycle: true, cycleParticipants, loopType, detectedCycle };
    }
  }
  return { hasCycle: false };
}

function buildAdjacencyMap(rawMessages) {
  const adj = new Map();
  for (const msg of rawMessages) {
    const from = String(msg.from || msg.sender || msg.agentId || 'A').trim();
    const to = String(msg.to || msg.recipient || msg.target || 'B').trim();
    if (from && to && from !== to) {
      if (!adj.has(from)) adj.set(from, new Set());
      adj.get(from).add(to);
    }
  }
  return adj;
}

function dfsCycleDetection(adj) {
  const visited = new Set();
  const recStack = new Set();
  let hasCycle = false;
  let cycleParticipants = [];
  let loopType = 'none';
  let detectedCycle = null;

  function dfs(node, path = []) {
    visited.add(node);
    recStack.add(node);
    path.push(node);
    const neighbors = adj.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, [...path])) return true;
      } else if (recStack.has(neighbor)) {
        hasCycle = true;
        loopType = 'agent_ping_pong';
        const cycleStart = path.indexOf(neighbor);
        cycleParticipants = cycleStart >= 0 ? path.slice(cycleStart) : [neighbor, node];
        detectedCycle = path.slice(cycleStart);
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      if (dfs(node, [])) break;
    }
  }
  return { hasCycle, cycleParticipants, loopType, detectedCycle };
}

async function penalizeBudget(db, targetAgentId, cycleParticipants = []) {
  let budgetPenalized = 0;
  try {
    const targets = targetAgentId
      ? [targetAgentId]
      : (Array.isArray(cycleParticipants) ? cycleParticipants.filter(Boolean) : []);

    for (const agentId of targets) {
      const res = await db.run("UPDATE agents SET cognitive_budget = MAX(0, COALESCE(cognitive_budget, 100) - 15) WHERE id = ?", agentId);
      if (res && typeof res.changes === 'number') {
        if (res.changes > 0) budgetPenalized += 15;
      } else {
        budgetPenalized += 15;
      }
    }
  } catch (_) {}
  return budgetPenalized;
}

function buildCycleResult(..._args) {
  const [hasCycle, loopType, cycleParticipants, detectedCycle, budgetPenalized] = _args;

  return {
    success: true, hasCycle, action: hasCycle ? 'BREAK_LOOP' : 'CONTINUE',
    intervention: hasCycle, loopType, cycleParticipants, detectedCycle,
    budgetPenalized,
    recommendation: hasCycle ? 'Break communication loop: mandate external decision or inject novel evidence' : 'No cycle detected'
  };
}

async function cycleDetection(context = {}) {
  const rawMessages = context.messages || context.turns || context.history || [];
  const maxRepeats = Number.isInteger(context.maxRepeats) ? context.maxRepeats : 2;
  const sequence = rawMessages.map(m => {
    if (typeof m === 'string') return m;
    const actor = m.from || m.sender || m.agentId || m.action || m.tool || 'unknown';
    const target = m.to || m.recipient || m.tool || '';
    return target ? `${actor}->${target}` : actor;
  });

  const seqResult = detectSequentialCycle(sequence, maxRepeats);
  let hasCycle = seqResult.hasCycle;
  let cycleParticipants = seqResult.cycleParticipants || [];
  let loopType = seqResult.loopType || 'none';
  let detectedCycle = seqResult.detectedCycle || null;

  if (!hasCycle && rawMessages.length >= 2) {
    const adj = buildAdjacencyMap(rawMessages);
    const dfsResult = dfsCycleDetection(adj);
    if (dfsResult.hasCycle) {
      hasCycle = true;
      cycleParticipants = dfsResult.cycleParticipants;
      loopType = dfsResult.loopType;
      detectedCycle = dfsResult.detectedCycle;
    }
  }

  let budgetPenalized = 0;
  if (hasCycle) {
    const db = await getDatabase();
    budgetPenalized = await penalizeBudget(db, context.agentId || context.targetId, cycleParticipants);
    telemetry.emitEvent({
      eventType: 'COMMUNICATION_CYCLE_DETECTED',
      agentId: context.agentId || context.orchestratorId || 'strategy_adapter',
      action: 'BREAK_LOOP',
      detail: `Cycle detected in agent communication (${loopType}): ${cycleParticipants.join(' <-> ')}`,
      severity: 'warning', payload: { loopType, cycleParticipants, detectedCycle, budgetPenalized }
    });
  }
  return buildCycleResult(hasCycle, loopType, cycleParticipants, detectedCycle, budgetPenalized);
}

module.exports = { cycleDetection, detectSequentialCycle, buildAdjacencyMap, dfsCycleDetection, penalizeBudget };
