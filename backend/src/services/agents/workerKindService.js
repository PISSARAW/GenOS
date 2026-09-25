'use strict';

const KINDS = Object.freeze({
  scout_cell: ['Sensory', 'scout_observation', 'ScoutCell'],
  resident_daemon: ['Sensory', 'dossier', 'ResidentDaemon'],
  bounded_worker: ['Execution', 'dossier', 'BoundedWorker'],
  adaptive_worker: ['Execution', 'dossier', 'AdaptiveWorker'],
  specialist: ['Execution', 'dossier', 'Specialist'],
  procedural_executor: ['Execution', 'dossier', 'BoundedWorker'],
  symbiotic_worker: ['Execution', 'dossier', 'BoundedWorker'],
  verifier_worker: ['Epistemic', 'verification_report', 'Verifier'],
  red_worker: ['Epistemic', 'verification_report', 'Verifier'],
  experimental_worker: ['Epistemic', 'experiment_record', 'BoundedWorker'],
  formal_worker: ['Epistemic', 'formal_certificate', 'BoundedWorker'],
  synthesis_worker: ['Epistemic', 'synthesis_dossier', 'Verifier'],
  creative_worker: ['AdaptiveRepair', 'creative_candidate', 'BoundedWorker'],
  medical_worker: ['AdaptiveRepair', 'clinical_report', 'Verifier'],
  recovery_worker: ['AdaptiveRepair', 'dossier', 'BoundedWorker'],
  forensic_worker: ['AdaptiveRepair', 'causal_dossier', 'Verifier'],
  liaison_worker: ['Organizational', 'dossier', 'BoundedWorker'],
  teaching_worker: ['Organizational', 'training_packet', 'ScoutCell'],
  sub_orchestrator: ['Organizational', 'dossier', 'SubOrchestrator']
});

const ROLE_ALIASES = Object.freeze({
  implementation: 'bounded_worker', frontend_developer: 'bounded_worker',
  independent_reviewer: 'verifier_worker', neutral_observer: 'scout_cell',
  verifier: 'verifier_worker',
  red_team: 'red_worker', blue_team: 'bounded_worker', analyst: 'bounded_worker',
  recovery_specialist: 'recovery_worker', contract_auditor: 'verifier_worker',
  strategist: 'sub_orchestrator', literary_author: 'creative_worker',
  direct_author: 'creative_worker', planned_author: 'creative_worker',
  dramaturg: 'creative_worker', literary_critic: 'verifier_worker',
  ux_designer: 'specialist', backend_architect: 'specialist', security_engineer: 'specialist'
});
const { artifactInstruction } = require('./workerArtifactContract');
const PROMPT_RULES = Object.freeze({
  scout_cell: 'Observe only. Return structured observations, references, confidence, and uncertainties; do not execute or modify files.',
  resident_daemon: 'Monitor the assigned territory and report findings with evidence; do not make mission decisions.',
  bounded_worker: 'Complete only the assigned scope using the current tool lease; return evidence and provenance.',
  adaptive_worker: 'Use only the contract strategies and change strategy within the stated budget.',
  specialist: 'Work within the declared niche and state when the task falls outside it.',
  procedural_executor: 'Use deterministic procedures only and return solver receipts.',
  symbiotic_worker: 'Use only procedures and capabilities granted by the host contract.',
  verifier_worker: 'Verify independently and return Accept, Reject, or Unresolved with reproduction evidence.',
  red_worker: 'Act as an adversarial reviewer; report falsifiable failure cases and cite their reproduction receipts.',
  experimental_worker: 'State the hypothesis and protocol, record measurements, and preserve uncertainty.',
  formal_worker: 'Return a formal certificate for the exact claim and cite the supplied or executed solver receipt; never invent a solver run.',
  synthesis_worker: 'Synthesize the dossiers while preserving material disagreements and provenance.',
  creative_worker: 'Return a candidate with assumptions and a falsification test in the creative_candidate contract; do not use an alternate creative artifact format or promote it.',
  medical_worker: 'For a synthetic educational vignette only, give non-diagnostic considerations with uncertainty and a safety note; do not diagnose or recommend treatment.',
  recovery_worker: 'Use only the leased recovery action, then report the restored state and remaining risks.',
  forensic_worker: 'Reconstruct only causal links supported by incident receipts; separate observed facts from hypotheses.',
  liaison_worker: 'Bridge the assigned groups with a concise handoff that preserves source references.',
  teaching_worker: 'Transmit only a validated procedure with prerequisites, steps, and supporting evidence.',
  sub_orchestrator: 'Coordinate only this subgraph; do not alter global topology or promote results; honor spawn and depth ceilings.'
});
const AUTHORITY_OVERRIDES = Object.freeze({
  resident_daemon: { execute: true },
  specialist: { write: false },
  creative_worker: { execute: false },
  synthesis_worker: { execute: false },
  liaison_worker: { execute: false },
  // The base contract stays non-delegating; worker creation may grant the
  // separate, bounded sub-orchestrator contract before persistence.
  sub_orchestrator: { write: false, spawn: false, delegate: false }
});

function normalize(value) {
  return String(value || '').trim().replace(/([a-z])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase();
}

function resolveWorkerKind(explicitKind, role) {
  const explicit = normalize(explicitKind);
  if (explicit) {
    if (!KINDS[explicit]) throw Object.assign(new Error(`Unknown worker kind '${explicitKind}'.`), { code: 'UNKNOWN_WORKER_KIND' });
    return explicit;
  }
  const normalizedRole = normalize(role);
  if (KINDS[normalizedRole]) return normalizedRole;
  return ROLE_ALIASES[normalizedRole] || 'bounded_worker';
}

function kindDefinition(kind) {
  const resolved = resolveWorkerKind(kind);
  const [family, artifact, authorityPhenotype] = KINDS[resolved];
  return { kind: resolved, family, artifact, authorityPhenotype };
}

function applyAuthorityOverrides(kind, profile = {}) {
  return { ...profile, write: false, ...(AUTHORITY_OVERRIDES[resolveWorkerKind(kind)] || {}) };
}

function buildWorkerContract(kind, mission = {}) {
  const definition = kindDefinition(kind);
  const profile = require('./phenotypeRegistryService').getAuthorityProfile(definition.authorityPhenotype) || {};
  const authorities = applyAuthorityOverrides(definition.kind, profile);
  const subOrchestrator = definition.kind === 'sub_orchestrator';
  return {
    version: 1,
    identity: { workerKind: definition.kind, parentId: mission.orchestratorAgentId || mission.parentAgentId || null },
    mission: { objective: mission.prompt || mission.currentTask || '', scope: mission.scope || mission.workspaceRoot || '' },
    authority: {
      read: Boolean(authorities.read), analyze: Boolean(authorities.analyze),
      execute: Boolean(authorities.execute), write: Boolean(authorities.write),
      spawn: false,
      delegate: false, promote: Boolean(authorities.promote),
      topology: false, strategy: ['adaptive_worker', 'specialist', 'sub_orchestrator'].includes(definition.kind)
    },
    spawnBudget: 0,
    delegationDepth: 0,
    evidence: { requiredArtifacts: [definition.artifact], provenanceRequired: true },
    limits: { maxIterations: definition.kind === 'scout_cell' ? 1 : (subOrchestrator ? 30 : null) }
  };
}

function grantBoundedDelegation(contract) {
  if (contract.identity?.workerKind !== 'sub_orchestrator') return contract;
  contract.authority.spawn = true;
  contract.authority.delegate = true;
  contract.spawnBudget = 5;
  contract.delegationDepth = 1;
  contract.delegationExpiresAt = Date.now() + 3600000;
  contract.limits = { ...contract.limits, maxChildren: 5, maxTokens: 10000 };
  return contract;
}

function promptRule(kind) {
  return PROMPT_RULES[resolveWorkerKind(kind)];
}

function evidenceRule(contract) {
  return artifactInstruction(contract);
}

module.exports = { KINDS, ROLE_ALIASES, PROMPT_RULES, AUTHORITY_OVERRIDES, normalize, resolveWorkerKind, kindDefinition, applyAuthorityOverrides, buildWorkerContract, grantBoundedDelegation, promptRule, evidenceRule };
