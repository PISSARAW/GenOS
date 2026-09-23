'use strict';

/**
 * @file capabilityEscalationService.js
 * @description Capability escalation protocol: workers request missing capabilities,
 * the orchestrator evaluates with structured decisions (grant/deny/substitute/
 * changeStrategy/changeTopology/delegate). All outcomes logged with provenance.
 */

const { getConcept } = require('./capabilityGraphService');
const { derivePolicyLease, CAPABILITY_TOOLS } = require('./toolLeasePolicy');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DECISION_TYPES = Object.freeze({
  GRANT: 'grant',
  DENY: 'deny',
  GRANT_BOUNDED: 'grantBounded',
  SUBSTITUTE: 'substitute',
  CHANGE_STRATEGY: 'changeStrategy',
  CHANGE_TOPOLOGY: 'changeTopology',
  DELEGATE: 'delegate',
  ASSIMILATE_PLASMID: 'assimilatePlasmid',
  SPAWN_SPECIALIST_GENOTYPE: 'spawnSpecialistGenotype',
  EVOLVE_GENOTYPE: 'evolveGenotype'
});

const PROVENANCE_LOG = [];
const MAX_LOG_SIZE = 1000;

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

function logProvenance(entry) {
  const e = { ...entry, loggedAt: new Date().toISOString() };
  PROVENANCE_LOG.push(e);
  if (PROVENANCE_LOG.length > MAX_LOG_SIZE) PROVENANCE_LOG.shift();
}

function getProvenanceLog() { return [...PROVENANCE_LOG]; }

// ---------------------------------------------------------------------------
// Capability Graph validation
// ---------------------------------------------------------------------------

function capabilityExists(capability) {
  return getConcept(`capability:${capability}`) !== null;
}

function matchTopology(cap, worker) {
  const topos = cap.compatible_topologies || [];
  return !worker?.topology || topos.length === 0 || topos.includes(worker.topology);
}

function matchRole(cap, worker) {
  const roles = cap.compatible_roles || [];
  return !worker?.role || roles.length === 0 || roles.includes(worker.role);
}

function isCompatibleWithWorker(capability, worker) {
  const cap = getConcept(`capability:${capability}`);
  if (!cap) return false;
  return matchTopology(cap, worker) && matchRole(cap, worker);
}

function findFallbacks(capability) {
  const upper = capability.toUpperCase();
  return Object.keys(CAPABILITY_TOOLS)
    .filter(c => c.includes(upper) || upper.includes(c) || similarCategory(c, upper))
    .slice(0, 5);
}

function similarCategory(a, b) {
  const cats = ['MEMORY', 'INFERENCE', 'SANDBOX', 'SECURITY'];
  return cats.some(c => a.includes(c) && b.includes(c));
}

// ---------------------------------------------------------------------------
// Worker side: requestCapability
// ---------------------------------------------------------------------------

function requestCapability(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const {
    workerId, orchestratorId, requestedCapability,
    reason, evidence, expectedValue, estimatedCost, authorityNeeded
  } = ctx;

  const request = {
    workerId,
    capability: requestedCapability,
    reason: reason || '',
    evidence: evidence || [],
    expectedValue: expectedValue || null,
    estimatedCost: estimatedCost || 0,
    authorityNeeded: authorityNeeded || 'none',
    timestamp: new Date().toISOString(),
    _meta: {
      exists: capabilityExists(requestedCapability),
      compatible: isCompatibleWithWorker(requestedCapability, ctx),
      orchestratorId
    }
  };

  logProvenance({ type: 'REQUEST', request });
  return request;
}

// ---------------------------------------------------------------------------
// Orchestrator side: evaluateRequest
// ---------------------------------------------------------------------------

const DENIAL_RULES = [
  {
    reason: 'capability_not_found',
    test: (req, ctx) => !capabilityExists(req.capability),
    fb: (req) => findFallbacks(req.capability)
  },
  {
    reason: 'topology_role_incompatible',
    test: (req, ctx) => !isCompatibleWithWorker(req.capability, ctx.currentState),
    alt: ['changeTopology', 'delegate']
  },
  {
    reason: 'already_active',
    test: (req, ctx) => (ctx.activeCapabilities || []).includes(req.capability),
    alt: ['reuse_existing']
  },
  {
    reason: 'budget_exceeded',
    test: (req, ctx) => !checkBudget(req, ctx.budget).ok,
    alt: ['changeStrategy']
  },
  {
    reason: 'insufficient_authority',
    test: (req, ctx) => !checkAuthority(req, ctx.currentState).ok,
    alt: ['escalate_authority']
  }
];

function firstDenyingRule(request, context) {
  for (const rule of DENIAL_RULES) {
    if (rule.test(request, context)) return rule;
  }
  return null;
}

function shouldBoundedGrant(request, budget) {
  const cost = request.estimatedCost || 0;
  const limit = budget?.maxEscalationCost || 500;
  return cost > limit || request.authorityNeeded === 'elevated';
}

function evaluateRequest(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Invalid context');
  const { request, currentState, budget, activeCapabilities } = ctx;
  if (!request || !request.capability) return buildDeny(request || {}, { reason: 'invalid_request' });

  const context = { currentState, budget, activeCapabilities };
  const rule = firstDenyingRule(request, context);
  if (rule) {
    return buildDeny(request, {
      reason: rule.reason,
      fallbackCapabilities: rule.fb ? rule.fb(request) : [],
      alternativeApproaches: rule.alt || []
    });
  }

  if (shouldBoundedGrant(request, budget)) return buildBoundedGrant(request, budget);
  return buildGrant(request, budget);
}

// ---------------------------------------------------------------------------
// Decision builders
// ---------------------------------------------------------------------------

function buildGrant(request, budget) {
  const grant = {
    type: DECISION_TYPES.GRANT,
    capability: request.capability,
    constraints: {
      maxBudget: budget?.tokens || 10000,
      maxCalls: budget?.maxCalls || 100,
      ttlMs: budget?.ttlMs || 3600000
    },
    escalationPath: 'auto',
    conditions: [],
    grantedAt: new Date().toISOString()
  };
  logProvenance({ type: 'GRANT', request, grant });
  return grant;
}

function buildBoundedGrant(request, budget) {
  const grant = {
    type: DECISION_TYPES.GRANT_BOUNDED,
    capability: request.capability,
    constraints: {
      maxBudget: Math.min(request.estimatedCost || 500, budget?.tokens || 10000),
      maxCalls: Math.min(budget?.maxCalls || 10, 25),
      ttlMs: budget?.ttlMs || 1800000
    },
    escalationPath: 'review',
    conditions: ['budget_review_after_use', 'authority_recheck'],
    grantedAt: new Date().toISOString()
  };
  logProvenance({ type: 'GRANT_BOUNDED', request, grant });
  return grant;
}

function buildDeny(request, options) {
  const deny = {
    type: DECISION_TYPES.DENY,
    reason: options?.reason || 'unknown',
    fallbackCapabilities: options?.fallbackCapabilities || [],
    alternativeApproaches: options?.alternativeApproaches || [],
    deniedAt: new Date().toISOString()
  };
  logProvenance({ type: 'DENY', request, deny });
  return deny;
}

// ---------------------------------------------------------------------------
// Strategy routing for alternative decisions
// ---------------------------------------------------------------------------

function routeDecision(strategy, request, context) {
  const map = {
    [DECISION_TYPES.CHANGE_STRATEGY]: {
      type: DECISION_TYPES.CHANGE_STRATEGY, capability: request.capability,
      message: 'Switch to alternative strategy'
    },
    [DECISION_TYPES.ASSIMILATE_PLASMID]: {
      type: DECISION_TYPES.ASSIMILATE_PLASMID, capability: request.capability,
      plasmidId: context.plasmidId || null, message: 'Assimilate compatible plasmid (revocable, lease-gated)'
    },
    [DECISION_TYPES.SPAWN_SPECIALIST_GENOTYPE]: {
      type: DECISION_TYPES.SPAWN_SPECIALIST_GENOTYPE, capability: request.capability,
      genomeId: context.genomeId || null, message: 'Spawn specialist genotype'
    },
    [DECISION_TYPES.EVOLVE_GENOTYPE]: {
      type: DECISION_TYPES.EVOLVE_GENOTYPE, capability: request.capability,
      message: 'Propose cross/mutate/graft candidate (evaluation required)'
    },
    [DECISION_TYPES.CHANGE_TOPOLOGY]: {
      type: DECISION_TYPES.CHANGE_TOPOLOGY, capability: request.capability,
      message: 'Restructure topology to accommodate'
    },
    [DECISION_TYPES.DELEGATE]: {
      type: DECISION_TYPES.DELEGATE, capability: request.capability,
      message: 'Delegate to authorized worker'
    },
    [DECISION_TYPES.SUBSTITUTE]: buildGrant(
      { ...request, capability: context.substituteCapability }, context.budget
    )
  };
  return map[strategy] || buildDeny(request, { reason: 'no_viable_strategy' });
}

// ---------------------------------------------------------------------------
// Authority and budget checks
// ---------------------------------------------------------------------------

function checkBudget(request, budget) {
  if (!budget) return { ok: true };
  const limit = budget.maxEscalationCost != null ? budget.maxEscalationCost : Infinity;
  return { ok: (request.estimatedCost || 0) <= limit };
}

function getAuthorityTools(capability) {
  return CAPABILITY_TOOLS[capability.toUpperCase()] || [];
}

function toolsAreInLease(tools, lease) {
  return tools.every(t => lease.includes(t));
}

function checkAuthority(request, state) {
  const needed = request.authorityNeeded;
  if (!needed || needed === 'none') return { ok: true };
  if (!state) return { ok: false };
  const tools = getAuthorityTools(request.capability);
  if (tools.length === 0) return { ok: true };
  return { ok: toolsAreInLease(tools, buildLease(request.capability, state)) };
}

function buildLease(capability, state) {
  const role = state.role || 'worker';
  const mode = role === 'orchestrator' ? 'orchestrator' : 'worker';
  return derivePolicyLease({ executionMode: mode, role, capabilities: [capability] });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

module.exports = {
  requestCapability,
  evaluateRequest,
  routeDecision,
  buildGrant,
  buildBoundedGrant,
  buildDeny,
  getProvenanceLog,
  DECISION_TYPES,
  capabilityExists,
  isCompatibleWithWorker,
  findFallbacks
};
