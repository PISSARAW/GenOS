'use strict';

/**
 * Instinct Runtime — Fixed Action Patterns (PAFs) that bypass the LLM.
 *
 * Instincts are fast, hard-coded responses to known situations. They
 * produce PRESSURE signals (not topology decisions). The Topology
 * Resolver / MorphogenesisPlanner decides based on pressure.
 *
 * Order: reflex < instinct < learned procedure < deliberation < creativity.
 *
 * Critical invariants:
 *   - Instinct NEVER changes global topology directly.
 *   - Instinct produces PRESSURE signals.
 *   - Security/authority can veto any instinct.
 */

const { emit } = require('../agentOrchestrationState');

// ---------------------------------------------------------------------------
// Priority registry — lower number = higher priority (evaluated first)
// ---------------------------------------------------------------------------

const PRIORITY = Object.freeze({
  RESOURCE_PROTECTION: 1,
  DEADLINE_APPROACHING: 2,
  REPETITION_ESCAPE: 3,
  BLOCKER_ESCALATION: 4,
  EVIDENCE_EMISSION: 5
});

// ---------------------------------------------------------------------------
// Core instinct definitions
// ---------------------------------------------------------------------------

const CORE_INSTINCTS = [
  {
    name: 'RESOURCE_PROTECTION',
    description: 'Stop non-essential work when budget below 10%',
    priority: PRIORITY.RESOURCE_PROTECTION,
    vetoableBy: ['security', 'authority'],
    triggerCondition: (ctx) => {
      const budget = ctx?.agentExpressionContext?.budget;
      if (!budget || !budget.total) return false;
      return budget.remaining / budget.total < 0.10;
    },
    action: (ctx) => ({
      type: 'PRESSURE',
      signal: 'BUDGET_ALERT',
      payload: {
        instinct: 'RESOURCE_PROTECTION',
        remaining: ctx?.agentExpressionContext?.budget?.remaining,
        total: ctx?.agentExpressionContext?.budget?.total,
        severity: 'critical'
      },
      message: 'Budget below 10% — requesting reevaluation'
    })
  },
  {
    name: 'DEADLINE_APPROACHING',
    description: 'Emit warning when time or token budget is low',
    priority: PRIORITY.DEADLINE_APPROACHING,
    vetoableBy: ['security', 'authority'],
    triggerCondition: (ctx) => {
      const ec = ctx?.agentExpressionContext;
      if (!ec) return false;
      const tokenRatio = ec.maxTokens ? ec.currentTokenUsage / ec.maxTokens : 0;
      if (tokenRatio > 0.85) return true;
      if (ec.deadline && ec.startedAt) {
        const elapsed = Date.now() - ec.startedAt;
        const total = ec.deadline - ec.startedAt;
        return total > 0 && elapsed / total > 0.85;
      }
      return false;
    },
    action: (ctx) => ({
      type: 'PRESSURE',
      signal: 'DEADLINE_WARNING',
      payload: {
        instinct: 'DEADLINE_APPROACHING',
        tokenRatio: ctx?.agentExpressionContext?.maxTokens
          ? ctx.agentExpressionContext.currentTokenUsage / ctx.agentExpressionContext.maxTokens
          : null,
        severity: 'warning'
      },
      message: 'Deadline approaching — consider early termination'
    })
  },
  {
    name: 'REPETITION_ESCAPE',
    description: 'Same error repeated 4+ times with no information gain',
    priority: PRIORITY.REPETITION_ESCAPE,
    vetoableBy: ['security', 'authority'],
    triggerCondition: (ctx) => {
      const errors = ctx?.agentExpressionContext?.errors;
      if (!Array.isArray(errors) || errors.length < 4) return false;
      const last4 = errors.slice(-4);
      const sameError = last4.every((e) => e.code === last4[0].code);
      const noGain = last4.every((e) => !e.informationGain || e.informationGain <= 0);
      const dissonanceRising = last4.every((e, i) => i === 0 || e.dissonance >= last4[i - 1].dissonance);
      return sameError && noGain && dissonanceRising;
    },
    action: (ctx) => ({
      type: 'PRESSURE',
      signal: 'STALL',
      payload: {
        instinct: 'REPETITION_ESCAPE',
        errorCode: ctx?.agentExpressionContext?.errors?.slice(-1)[0]?.code,
        attemptCount: 4,
        severity: 'critical'
      },
      message: 'Repeated failure with no information gain — stop retry, request reevaluation'
    })
  },
  {
    name: 'BLOCKER_ESCALATION',
    description: 'Escalate unresolved blocker to orchestrator after N attempts',
    priority: PRIORITY.BLOCKER_ESCALATION,
    vetoableBy: ['security', 'authority'],
    triggerCondition: (ctx) => {
      const blockers = ctx?.agentExpressionContext?.blockers;
      if (!Array.isArray(blockers) || blockers.length === 0) return false;
      return blockers.some((b) => b.attempts >= 3 && !b.resolved);
    },
    action: (ctx) => {
      const blockers = ctx?.agentExpressionContext?.blockers || [];
      const stuck = blockers.find((b) => b.attempts >= 3 && !b.resolved);
      return {
        type: 'PRESSURE',
        signal: 'BLOCKER',
        payload: {
          instinct: 'BLOCKER_ESCALATION',
          blockerId: stuck?.id,
          blockerType: stuck?.type,
          attempts: stuck?.attempts,
          severity: 'high'
        },
        message: `Blocker ${stuck?.id || 'unknown'} unresolved after ${stuck?.attempts || '?'} attempts`
      };
    }
  },
  {
    name: 'EVIDENCE_EMISSION',
    description: 'Emit signal when new evidence is generated',
    priority: PRIORITY.EVIDENCE_EMISSION,
    vetoableBy: ['security'],
    triggerCondition: (ctx) => {
      const evidence = ctx?.agentExpressionContext?.evidence;
      if (!Array.isArray(evidence) || evidence.length === 0) return false;
      return evidence.some((e) => e.isNew && e.delta > 0);
    },
    action: (ctx) => {
      const evidence = (ctx?.agentExpressionContext?.evidence || []).filter((e) => e.isNew && e.delta > 0);
      return {
        type: 'PRESSURE',
        signal: 'EVIDENCE',
        payload: {
          instinct: 'EVIDENCE_EMISSION',
          evidenceCount: evidence.length,
          totalDelta: evidence.reduce((sum, e) => sum + (e.delta || 0), 0),
          severity: 'info'
        },
        message: `New evidence generated (${evidence.length} items, delta=${evidence.reduce((s, e) => s + (e.delta || 0), 0)})`
      };
    }
  }
];

// ---------------------------------------------------------------------------
// Instinct registry — mutable at runtime via registerInstinct
// ---------------------------------------------------------------------------

let instinctRegistry = [...CORE_INSTINCTS];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortByPriority(a, b) {
  return a.priority - b.priority;
}

function validateInstinct(def) {
  if (!def || typeof def !== 'object') throw new Error('Instinct definition must be an object');
  if (!def.name || typeof def.name !== 'string') throw new Error('Instinct requires a name');
  if (typeof def.triggerCondition !== 'function') throw new Error('Instinct requires triggerCondition function');
  if (typeof def.action !== 'function') throw new Error('Instinct requires action function');
  if (!Array.isArray(def.vetoableBy)) throw new Error('Instinct requires vetoableBy array');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all registered instincts against the given context.
 * Returns InstinctAction[] ordered by priority (highest first).
 *
 * @param {{ agentExpressionContext: object, event: object }} ctx
 * @returns {Array<{ type: string, signal: string, payload: object, message: string }>}
 */
function evaluateInstincts(ctx) {
  if (!ctx || !ctx.agentExpressionContext) return [];
  const triggered = [];
  for (const instinct of instinctRegistry) {
    if (instinct.triggerCondition(ctx)) {
      triggered.push(instinct.action(ctx));
    }
  }
  triggered.sort((a, b) => {
    const pa = CORE_INSTINCTS.find((i) => i.action({ agentExpressionContext: {} })?.signal === a.signal)?.priority ?? 99;
    const pb = CORE_INSTINCTS.find((i) => i.action({ agentExpressionContext: {} })?.signal === b.signal)?.priority ?? 99;
    return pa - pb;
  });
  return triggered;
}

/**
 * Execute a single instinct action — emits the pressure signal.
 * NEVER changes global topology. Returns the execution result.
 *
 * @param {{ type: string, signal: string, payload: object, message: string }} action
 * @returns {{ emitted: boolean, signal: string, timestamp: string }}
 */
function executeInstinct(action) {
  if (!action || !action.signal) throw new Error('Invalid instinct action');
  const agentId = action.payload?.agentId || 'instinct-runtime';
  emit(
    agentId,
    'INSTINCT_SIGNAL',
    action.signal,
    action.message,
    { payload: action.payload, severity: action.payload?.severity || 'info' }
  );
  return {
    emitted: true,
    signal: action.signal,
    timestamp: new Date().toISOString()
  };
}

/**
 * Register a custom instinct at runtime.
 *
 * @param {{ name: string, description?: string, priority: number, vetoableBy: string[], triggerCondition: Function, action: Function }} def
 */
function registerInstinct(def) {
  validateInstinct(def);
  const idx = instinctRegistry.findIndex((i) => i.name === def.name);
  if (idx >= 0) {
    instinctRegistry[idx] = def;
  } else {
    instinctRegistry.push(def);
  }
  instinctRegistry.sort(sortByPriority);
  return { registered: def.name, totalInstincts: instinctRegistry.length };
}

/**
 * Get all registered instinct definitions.
 *
 * @returns {Array<object>}
 */
function getInstincts() {
  return instinctRegistry.map((i) => ({
    name: i.name,
    description: i.description,
    priority: i.priority,
    vetoableBy: [...i.vetoableBy]
  }));
}

module.exports = {
  evaluateInstincts,
  executeInstinct,
  registerInstinct,
  getInstincts,
  PRIORITY
};
