'use strict';

/**
 * Authority Matrix — M3 (unifiée spec, ADR 0043)
 *
 * Profils canoniques : les 8 phénotypes de la spec
 * (ScoutCell, BoundedWorker, AdaptiveWorker, Specialist, Verifier,
 * SubOrchestrator, Orchestrator, ResidentDaemon), alignés sur
 * `agents/phenotypeRegistryService.js` (authorityProfile).
 *
 * Séparation : cognitive capability != organizational authority.
 * Service pur : lookup table, sans DB ni effets de bord.
 *
 * Compatibilité : les anciens ids snake_case restent résolus via
 * LEGACY_ALIASES (insensible à la casse). `Reconciler` est une
 * extension hors spec (hygiène post-mission), pas un phénotype canonique.
 */

const AUTHORITY_DIMENSIONS = Object.freeze([
  'read',
  'analyze',
  'signal',
  'execute',
  'write',
  'delegate',
  'spawn',
  'promote',
  'mutate',
  'topology',
  'strategy',
  'escalate',
  'reconcile'
]);

const PROFILES = Object.freeze({
  ScoutCell: {
    description: 'Ephemeral observation unit — surfaces signals only, no execution.',
    authorities: {
      read: true, analyze: true, signal: true, execute: false,
      write: false, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: false,
      escalate: false, reconcile: false
    }
  },
  BoundedWorker: {
    description: 'Mission task executor — read/execute within lease, no spawn, no topology.',
    authorities: {
      read: true, analyze: false, signal: true, execute: true,
      write: false, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: false,
      escalate: true, reconcile: false
    }
  },
  AdaptiveWorker: {
    description: 'Self-adjusting worker — local strategy change, no spawn, no global topology.',
    authorities: {
      read: true, analyze: true, signal: true, execute: true,
      write: false, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: true,
      escalate: true, reconcile: false
    }
  },
  Specialist: {
    description: 'Deep single-domain expertise — write within domain, no spawn, no topology.',
    authorities: {
      read: true, analyze: true, signal: true, execute: true,
      write: true, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: false,
      escalate: true, reconcile: false
    }
  },
  Verifier: {
    description: 'Independent validation — adversarial review, no write, no topology.',
    authorities: {
      read: true, analyze: true, signal: true, execute: true,
      write: false, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: false,
      escalate: true, reconcile: true
    }
  },
  SubOrchestrator: {
    description: 'Bounded subgraph coordinator — local topology only, spawn within budget.',
    authorities: {
      read: true, analyze: true, signal: true, execute: true,
      write: true, delegate: true, spawn: true, promote: false,
      mutate: false, topology: false, strategy: true,
      escalate: true, reconcile: true
    }
  },
  Orchestrator: {
    description: 'Full mission authority — spawn, global topology, strategy, promotion.',
    authorities: {
      read: true, analyze: true, signal: true, execute: true,
      write: true, delegate: true, spawn: true, promote: true,
      mutate: false, topology: true, strategy: true,
      escalate: true, reconcile: true
    }
  },
  ResidentDaemon: {
    description: 'Long-lived observer — report only, no mission decisions, no writes.',
    authorities: {
      read: true, analyze: true, signal: true, execute: false,
      write: false, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: false,
      escalate: false, reconcile: false
    }
  },
  Reconciler: {
    description: 'EXTENSION hors spec — cleanup post-mission, no spawn, no topology.',
    authorities: {
      read: true, analyze: true, signal: false, execute: true,
      write: true, delegate: false, spawn: false, promote: false,
      mutate: false, topology: false, strategy: false,
      escalate: false, reconcile: true
    }
  }
});

// Ancienne taxonomie opérationnelle -> phénotype canonique (ADR 0043).
const LEGACY_ALIASES = Object.freeze({
  adaptive_worker: 'AdaptiveWorker',
  security_analyst: 'Specialist',
  contract_auditor: 'Verifier',
  dependency_manager: 'Specialist',
  documentation_curator: 'Specialist',
  strategist: 'SubOrchestrator',
  orchestrator: 'Orchestrator',
  elder: 'Orchestrator'
});

function normalizePhenotypeId(id) {
  return String(id || '').trim();
}

function resolveCanonical(id) {
  const raw = normalizePhenotypeId(id);
  if (PROFILES[raw]) return raw;
  const lower = raw.toLowerCase();
  const byLower = Object.keys(PROFILES).find((k) => k.toLowerCase() === lower);
  if (byLower) return byLower;
  if (LEGACY_ALIASES[lower]) return LEGACY_ALIASES[lower];
  return null;
}

function can(phenotypeId, action) {
  const canonical = resolveCanonical(phenotypeId);
  if (!canonical) return false;
  const authorities = PROFILES[canonical].authorities || {};
  return Boolean(authorities[action]);
}

function getAuthorityProfile(phenotypeId) {
  const canonical = resolveCanonical(phenotypeId);
  if (!canonical) return null;
  return {
    phenotypeId: canonical,
    description: PROFILES[canonical].description,
    authorities: Object.assign({}, PROFILES[canonical].authorities)
  };
}

function validateAction(agent, action) {
  if (!agent) return { allowed: false, reason: 'No agent provided.' };
  if (!action) return { allowed: false, reason: 'No action specified.' };
  const raw = agent.phenotype_id || agent.phenotypeId;
  if (!raw) return { allowed: false, reason: 'Agent has no phenotype.' };
  const canonical = resolveCanonical(raw);
  if (!canonical) return { allowed: false, reason: `Unknown phenotype: '${raw}'.` };
  if (!AUTHORITY_DIMENSIONS.includes(action)) return { allowed: false, reason: `Unknown action: '${action}'.` };
  if (can(canonical, action)) return { allowed: true, reason: null };
  return { allowed: false, reason: `Phenotype '${canonical}' is not authorized to perform '${action}'.` };
}

function getAllowedActions(phenotypeId) {
  const canonical = resolveCanonical(phenotypeId);
  if (!canonical) return [];
  const authorities = PROFILES[canonical].authorities || {};
  return Object.keys(authorities).filter((action) => authorities[action]);
}

function getForbiddenActions(phenotypeId) {
  const canonical = resolveCanonical(phenotypeId);
  if (!canonical) return [];
  const authorities = PROFILES[canonical].authorities || {};
  return Object.keys(authorities).filter((action) => !authorities[action]);
}

function listPhenotypes() {
  return Object.keys(PROFILES);
}

module.exports = {
  AUTHORITY_DIMENSIONS,
  PROFILES,
  LEGACY_ALIASES,
  resolveCanonical,
  can,
  getAuthorityProfile,
  validateAction,
  getAllowedActions,
  getForbiddenActions,
  listPhenotypes
};
