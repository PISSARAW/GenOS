'use strict';

/**
 * Authority Matrix — M3
 *
 * Defines what each phenotype can do independently of their social role.
 * Separation: cognitive capability != organizational authority.
 *
 * This service is a pure lookup table. No DB, no side effects.
 */

const AUTHORITY_DIMENSIONS = Object.freeze([
  'read',
  'analyze',
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
  adaptive_worker: {
    description: 'General-purpose worker agent. Can observe and execute but cannot restructure the organization.',
    authorities: {
      read: true,
      analyze: true,
      execute: true,
      write: false,
      delegate: false,
      spawn: false,
      promote: false,
      mutate: false,
      topology: false,
      strategy: false,
      escalate: true,
      reconcile: false
    }
  },
  security_analyst: {
    description: 'Security-focused phenotype. Observes, analyzes threats, and escalates. Cannot mutate or restructure.',
    authorities: {
      read: true,
      analyze: true,
      execute: true,
      write: false,
      delegate: false,
      spawn: false,
      promote: false,
      mutate: false,
      topology: false,
      strategy: false,
      escalate: true,
      reconcile: true
    }
  },
  contract_auditor: {
    description: 'Contract drift detection and enforcement. Can read and analyze, escalate for repairs.',
    authorities: {
      read: true,
      analyze: true,
      execute: false,
      write: false,
      delegate: false,
      spawn: false,
      promote: false,
      mutate: false,
      topology: false,
      strategy: false,
      escalate: true,
      reconcile: false
    }
  },
  dependency_manager: {
    description: 'Dependency health monitoring and repair. Can write to fix issues, escalate for deeper problems.',
    authorities: {
      read: true,
      analyze: true,
      execute: true,
      write: true,
      delegate: false,
      spawn: false,
      promote: false,
      mutate: false,
      topology: false,
      strategy: false,
      escalate: true,
      reconcile: true
    }
  },
  documentation_curator: {
    description: 'Documentation health and staleness. Can read, write docs, escalate for restructuring.',
    authorities: {
      read: true,
      analyze: true,
      execute: false,
      write: true,
      delegate: false,
      spawn: false,
      promote: false,
      mutate: false,
      topology: false,
      strategy: false,
      escalate: true,
      reconcile: false
    }
  },
  strategist: {
    description: 'High-level planning and strategy. Can propose strategy changes but not execute directly.',
    authorities: {
      read: true,
      analyze: true,
      execute: false,
      write: false,
      delegate: true,
      spawn: false,
      promote: false,
      mutate: false,
      topology: false,
      strategy: true,
      escalate: true,
      reconcile: false
    }
  },
  orchestrator: {
    description: 'Full organizational authority. Can delegate, spawn, change topology and strategy.',
    authorities: {
      read: true,
      analyze: true,
      execute: true,
      write: true,
      delegate: true,
      spawn: true,
      promote: true,
      mutate: false,
      topology: true,
      strategy: true,
      escalate: true,
      reconcile: true
    }
  },
  elder: {
    description: 'Senior phenotype with full authority including mutation and promotion.',
    authorities: {
      read: true,
      analyze: true,
      execute: true,
      write: true,
      delegate: true,
      spawn: true,
      promote: true,
      mutate: true,
      topology: true,
      strategy: true,
      escalate: true,
      reconcile: true
    }
  }
});

function normalizePhenotypeId(id) {
  return String(id || '').trim();
}

function can(phenotypeId, action) {
  const id = normalizePhenotypeId(phenotypeId);
  const profile = PROFILES[id];
  if (!profile) return false;
  const authorities = profile.authorities || {};
  return Boolean(authorities[action]);
}

function getAuthorityProfile(phenotypeId) {
  const id = normalizePhenotypeId(phenotypeId);
  const profile = PROFILES[id];
  if (!profile) return null;
  return {
    phenotypeId: id,
    description: profile.description,
    authorities: Object.assign({}, profile.authorities)
  };
}

function validateAction(agent, action) {
  if (!agent) return { allowed: false, reason: 'No agent provided.' };
  if (!action) return { allowed: false, reason: 'No action specified.' };
  const phenotypeId = agent.phenotype_id || agent.phenotypeId;
  if (!phenotypeId) return { allowed: false, reason: 'Agent has no phenotype.' };
  if (!PROFILES[phenotypeId]) return { allowed: false, reason: `Unknown phenotype: '${phenotypeId}'.` };
  if (!AUTHORITY_DIMENSIONS.includes(action)) return { allowed: false, reason: `Unknown action: '${action}'.` };
  const allowed = can(phenotypeId, action);
  if (allowed) return { allowed: true, reason: null };
  return { allowed: false, reason: `Phenotype '${phenotypeId}' is not authorized to perform '${action}'.` };
}

function getAllowedActions(phenotypeId) {
  const id = normalizePhenotypeId(phenotypeId);
  const profile = PROFILES[id];
  if (!profile) return [];
  const authorities = profile.authorities || {};
  return Object.keys(authorities).filter((action) => authorities[action]);
}

function getForbiddenActions(phenotypeId) {
  const id = normalizePhenotypeId(phenotypeId);
  const profile = PROFILES[id];
  if (!profile) return [];
  const authorities = profile.authorities || {};
  return Object.keys(authorities).filter((action) => !authorities[action]);
}

function listPhenotypes() {
  return Object.keys(PROFILES);
}

module.exports = {
  AUTHORITY_DIMENSIONS,
  PROFILES,
  can,
  getAuthorityProfile,
  validateAction,
  getAllowedActions,
  getForbiddenActions,
  listPhenotypes
};
