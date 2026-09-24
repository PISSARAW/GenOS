/**
 * Signal Receptor Service — Receptor Registry & Deterministic Dispatch
 *
 * Implements the Signal → Receptor → Action pathway:
 *   1. A signal is published (ligand/voltage/pheromone/plasmid/tensor).
 *   2. Registered receptors are matched against the signal.
 *   3. If a receptor triggers (concentration >= threshold), a deterministic
 *      action is dispatched — NO LLM is invoked.
 *   4. Only unmatched signals escalate to LLM wake-up.
 *
 * This is the core of "zero-prompt" cognition: the runtime handles
 * transitions mechanically, and the LLM is an interrupt, not the substrate.
 */

const crypto = require('crypto');
const { evaluateLigandReactivity, SIGNAL_TYPES } = require('./biomimeticSignalingBus');

// ── Receptor registry ────────────────────────────────────────────────────────
// Receptors are stored in-memory (per process). For multi-instance deployments,
// a SQLite-backed registry with cache would be needed (P3).

const receptors = new Map(); // receptorId -> receptor

// ── Action dispatchers ───────────────────────────────────────────────────────
// Each action type has a handler. Handlers receive (receptor, signal, dispatchCtx)
// and return a result. They must be deterministic — no LLM calls.

const actionDispatchers = {
  /**
   * Emit a follow-up signal (cascade). E.g. TEST_READY → ARTIFACT_READY.
   * Profondeur bornée (MAX_CASCADE_DEPTH) : au-delà, refus anti-boucle.
   */
  emit_signal: async (receptor, signal, ctx) => {
    if (!ctx.publishSignal) return { executed: false, reason: 'NO_PUBLISH_FN' };
    const depth = Number(signal.depth || 0);
    if (depth >= MAX_CASCADE_DEPTH) return { executed: false, reason: 'MAX_CASCADE_DEPTH' };
    const cascadeData = receptor.actionData?.signalData || {};
    const result = await ctx.publishSignal({
      signalType: receptor.actionData?.signalType || SIGNAL_TYPES.LIGAND,
      signalData: {
        ...cascadeData,
        triggeredBy: signal.signalId,
        triggeredFrom: signal.signalType,
      },
      topic: receptor.actionData?.topic || signal.topic,
      senderAgentId: signal.senderAgentId,
      depth: depth + 1,
      ttlMs: receptor.actionData?.ttlMs,
    });
    return { executed: true, signalId: result.signalId, action: 'emit_signal' };
  },

  /**
   * Wake a worker agent (start a mission). This is the deterministic
   * alternative to "tell the LLM to wake the worker".
   */
  wake_worker: async (receptor, signal, ctx) => {
    if (!ctx.startMission) return { executed: false, reason: 'NO_START_MISSION_FN' };
    const mission = {
      agentId: receptor.actionData?.workerId,
      prompt: '',
      role: receptor.actionData?.role || 'implementation',
      executionBudget: receptor.actionData?.executionBudget || {},
      signalTriggered: true,
      triggerSignalId: signal.signalId,
      triggerReceptorId: receptor.id,
    };
    const result = await ctx.startMission(mission);
    return { executed: true, workerId: mission.agentId, action: 'wake_worker', result };
  },

  /**
   * Update agent state directly (status, current_task).
   */
  update_agent: async (receptor, signal, ctx) => {
    if (!ctx.updateAgent) return { executed: false, reason: 'NO_UPDATE_AGENT_FN' };
    await ctx.updateAgent(
      receptor.actionData?.agentId,
      receptor.actionData?.status,
      receptor.actionData?.currentTask
    );
    return {
      executed: true,
      agentId: receptor.actionData?.agentId,
      status: receptor.actionData?.status,
      action: 'update_agent',
    };
  },

  /**
   * Change organization topology deterministically.
   */
  change_organization: async (receptor, signal, ctx) => {
    if (!ctx.changeOrganization) return { executed: false, reason: 'NO_CHANGE_ORG_FN' };
    const result = await ctx.changeOrganization({
      orchestratorId: signal.senderAgentId,
      organization: receptor.actionData?.organization,
      reason: `Receptor '${receptor.id}' triggered by signal ${signal.signalId}`,
      changedBy: signal.senderAgentId,
    });
    return { executed: true, organization: result.organization, action: 'change_organization' };
  },
};

// ── Receptor CRUD ────────────────────────────────────────────────────────────

function registerReceptor(receptor) {
  validateReceptor(receptor);
  receptors.set(receptor.id, {
    id: receptor.id,
    targetLigand: receptor.targetLigand,
    threshold: Number(receptor.threshold ?? 0.5),
    targetAgentId: receptor.targetAgentId || null,
    action: receptor.action,
    actionData: receptor.actionData || {},
    enabled: receptor.enabled !== false,
    description: receptor.description || '',
    createdAt: receptor.createdAt || new Date().toISOString(),
  });
  return { registered: true, id: receptor.id };
}

function validateReceptor(receptor) {
  if (!receptor || !receptor.id) {
    throw new Error('Receptor must have an id');
  }
  if (!receptor.targetLigand) {
    throw new Error('Receptor must have a targetLigand');
  }
  if (!receptor.action || !actionDispatchers[receptor.action]) {
    throw new Error(`Unsupported receptor action '${receptor.action}'. Supported: ${Object.keys(actionDispatchers).join(', ')}`);
  }
}

function unregisterReceptor(receptorId) {
  return receptors.delete(receptorId);
}

function getReceptor(receptorId) {
  return receptors.get(receptorId) || null;
}

function listReceptors(filter = {}) {
  let result = [...receptors.values()];
  if (filter.enabled !== undefined) {
    result = result.filter((r) => r.enabled === filter.enabled);
  }
  if (filter.targetLigand) {
    result = result.filter((r) => r.targetLigand === filter.targetLigand);
  }
  if (filter.action) {
    result = result.filter((r) => r.action === filter.action);
  }
  return result;
}

// ── Matching & dispatch ──────────────────────────────────────────────────────

/**
 * Profondeur maximale de cascade émettrice : au-delà, les récepteurs
 * `emit_signal` refusent (anti-boucle : A → B → A ...).
 */
const MAX_CASCADE_DEPTH = 5;

/**
 * Destinataires déclarés d'un signal (jamais l'émetteur).
 */
function signalRecipients(signal) {
  const source = signal || {};
  const list = [];
  if (Array.isArray(source.recipientAgentIds)) list.push(...source.recipientAgentIds);
  for (const key of ['recipientAgentId', 'targetAgentId', 'recipientId']) {
    if (source[key]) list.push(source[key]);
  }
  return list;
}

/**
 * Un récepteur ciblé (targetAgentId) ne matche que si le récepteur est le
 * destinataire du signal. Comparer à l'émetteur (senderAgentId) inversait
 * le filtre : n'importe quel émetteur usurpant l'id déclenchait le récepteur.
 * Sans destinataire déclaré, un récepteur ciblé ne matche pas.
 */
function receptorTargetMatches(receptor, signal) {
  if (!receptor.targetAgentId) return true;
  return signalRecipients(signal).includes(receptor.targetAgentId);
}

/**
 * Un signal orphelin (ni émetteur, ni topic, ni destinataire) n'a aucun
 * contexte à escalader : llmRequired=false par défaut au lieu de réveiller
 * un LLM pour rien.
 */
function hasRoutingContext(signal) {
  const source = signal || {};
  return Boolean(
    source.senderAgentId || source.topic ||
    source.recipientAgentId || source.targetAgentId ||
    (Array.isArray(source.recipientAgentIds) && source.recipientAgentIds.length > 0)
  );
}

/**
 * Match a signal against all registered receptors.
 * Returns triggered receptors with their cascade signals.
 */
function matchReceptors(signal) {
  const triggered = [];
  for (const receptor of receptors.values()) {
    if (!receptor.enabled) continue;
    if (!receptorTargetMatches(receptor, signal)) {
      continue;
    }
    const ligandData = {
      ligand: signal.semanticType || signal.signalType,
      concentration: Number(signal.concentration ?? signal.signalData?.concentration ?? 0),
    };
    const reactivity = evaluateLigandReactivity(ligandData, {
      targetLigand: receptor.targetLigand,
      threshold: receptor.threshold,
      cascadeSignal: receptor.action,
    });
    if (reactivity.triggered) {
      triggered.push({ receptor, cascadeSignal: reactivity.cascadeSignal, delta: reactivity.delta });
    }
  }
  return triggered;
}

/**
 * Dispatch actions for triggered receptors.
 * Returns dispatch results. Does NOT throw — failures are collected.
 */
async function dispatchActions(triggered, signal, ctx = {}) {
  const results = [];
  for (const { receptor } of triggered) {
    const dispatcher = actionDispatchers[receptor.action];
    if (!dispatcher) {
      results.push({ receptorId: receptor.id, executed: false, reason: 'NO_DISPATCHER' });
      continue;
    }
    try {
      const result = await dispatcher(receptor, signal, ctx);
      results.push({ receptorId: receptor.id, ...result });
    } catch (error) {
      results.push({ receptorId: receptor.id, executed: false, reason: error.message });
    }
  }
  return results;
}

/**
 * Full pipeline: match → dispatch.
 * Returns { triggered: [...], dispatched: [...], llmRequired: boolean }
 * llmRequired is true only if no receptor triggered (cognition needed).
 */
async function matchAndDispatch(signal, ctx = {}) {
  const triggered = matchReceptors(signal);
  if (triggered.length === 0) {
    return { triggered: [], dispatched: [], llmRequired: hasRoutingContext(signal) };
  }
  const dispatched = await dispatchActions(triggered, signal, ctx);
  return { triggered: triggered.map((t) => t.receptor.id), dispatched, llmRequired: false };
}

module.exports = {
  MAX_CASCADE_DEPTH,
  registerReceptor,
  unregisterReceptor,
  getReceptor,
  listReceptors,
  matchReceptors,
  dispatchActions,
  matchAndDispatch,
  actionDispatchers,
};
