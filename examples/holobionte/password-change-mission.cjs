'use strict';

const { randomUUID } = require('node:crypto');

// Host : objectifs fixes, autorite finale sur la mission.
const HOST_OBJECTIVES = [
  'Concevoir une procedure de changement de mot de passe sans jamais exposer le secret en clair.',
  'Exiger une revalidation d identite avant toute rotation du secret.',
  'Refuser toute solution dangereuse detectee par le systeme immunitaire.',
  'Extraire les regles reutilisables vers la memoire symbiotique.'
];

const SAFE_PROCEDURE = {
  procedure: 'rotation-secret-compte',
  steps: [
    'Revalider l identite du titulaire (second facteur ou session recente de moins de 5 minutes) avant toute modification.',
    'Appliquer la politique du secret : longueur minimale 12, controle contre le corpus des secrets exposes, refus des 5 derniers secrets.',
    'Transporter le secret uniquement sur canal chiffre TLS, jamais en clair dans un courriel, un journal ou une URL.',
    'Stocker uniquement une empreinte Argon2id avec sel unique, comparaison en temps constant.',
    'Limiter les tentatives a 5 puis appliquer un verrouillage progressif avec alerte au titulaire.',
    'Revoquer les sessions existantes apres rotation et emettre un avis de confirmation sur le canal deja verifie.',
    'Journaliser chaque evenement de rotation (horodatage, issue) sans jamais y inscrire le secret.'
  ],
  policy: { minLength: 12, breachCheck: true, historyDepth: 5,
    rateLimit: { maxAttempts: 5, lockout: 'progressif' },
    sessionRevocation: true, audit: true, reauthRequired: true,
    hashing: 'argon2id', transport: 'tls' },
  reusableRules: [
    'Ne jamais exposer un secret en clair, ni en transit ni au repos.',
    'Revalider l identite avant chaque rotation de secret.',
    'Hachage a memoire dure avec sel unique et comparaison en temps constant.',
    'Revoquer les sessions existantes apres rotation.',
    'Journaliser l evenement sans le secret.',
    'Limiter les tentatives puis verrouiller progressivement.'
  ]
};

// Variante dangereuse : sert a prouver que l immunite refuse (sonde negative hors mission).
const DANGEROUS_PROCEDURE = {
  procedure: 'rotation-secret-compte',
  steps: [
    'Envoyer le nouveau secret au titulaire par courriel en clair.',
    'Inscrire le secret en clair dans les journaux applicatifs.',
    'Accepter tout secret d au moins 6 caracteres sans autre controle.'
  ],
  policy: { minLength: 6, breachCheck: false, historyDepth: 0,
    rateLimit: null, sessionRevocation: false, audit: false,
    reauthRequired: false, hashing: 'clair', transport: 'courriel' },
  reusableRules: []
};

const PLAINTEXT_HINT = /en clair|par courriel|journal|plaintext/i;
const NEGATION_HINT = /jamais|ne\s+\S+\s+pas|interdit|sans|refus|aucun/i;

const IMMUNE_CHECKS = [
  { id: 'requisition-reauth', evidence: 'immune-rule:reauth-required',
    violated: (proc) => proc.policy?.reauthRequired !== true },
  { id: 'force-politique', evidence: 'immune-rule:secret-strength',
    violated: (proc) => !(Number(proc.policy?.minLength) >= 12)
      || proc.policy?.breachCheck !== true || !(Number(proc.policy?.historyDepth) >= 1) },
  { id: 'secret-jamais-en-clair', evidence: 'immune-rule:no-plaintext',
    violated: (proc) => (proc.steps || []).some((step) => {
      const text = String(step);
      return PLAINTEXT_HINT.test(text) && !NEGATION_HINT.test(text);
    }) || ['clair', 'aucun', 'none'].includes(String(proc.policy?.hashing)) },
  { id: 'limitation-tentatives', evidence: 'immune-rule:rate-limit',
    violated: (proc) => !(Number(proc.policy?.rateLimit?.maxAttempts) > 0) },
  { id: 'revocation-sessions', evidence: 'immune-rule:session-revocation',
    violated: (proc) => proc.policy?.sessionRevocation !== true },
  { id: 'piste-audit-sans-secret', evidence: 'immune-rule:audit-trail',
    violated: (proc) => proc.policy?.audit !== true }
];

function reviewProcedure(result) {
  const proc = result && typeof result === 'object' ? result : {};
  return IMMUNE_CHECKS.filter((check) => {
    try { return check.violated(proc); } catch { return true; }
  }).map((check) => ({ check: check.id, evidence: check.evidence }));
}

function execution() {
  return { result: SAFE_PROCEDURE,
    receiptId: randomUUID(), resourcesConsumed: { tokens: 2 },
    contributionScore: 1, contractCompliant: true, benefitScore: 1,
    evidenceQuality: 1, costScore: 0.1, riskScore: 0 };
}

// Systeme immunitaire : verificateur independant du producteur.
function verifyCapability({ result, resultHash }) {
  const flaws = reviewProcedure(result);
  if (flaws.length > 0) {
    return { status: 'REJECTED', resultHash, verifierId: 'password-immune-verifier',
      evidenceRefs: flaws.map((flaw) => flaw.evidence), flaws: flaws.map((flaw) => flaw.check) };
  }
  return { status: 'VERIFIED', resultHash, verifierId: 'password-immune-verifier',
    evidenceRefs: ['immune-proof:secret-rotation-checklist', 'host-objective:secret-safety'] };
}

function createMissionInput() {
  return { hostId: 'password-host', missionId: randomUUID(),
    constitution: { objectives: HOST_OBJECTIVES },
    capability: 'password_change_procedure', request: { procedure: 'rotation-secret-compte' },
    budget: { tokens: 20, latencyMs: 15000, maxSteps: 2 },
    executeCapability: execution, trialCapabilityExecutor: execution, verifyCapability,
    symbionts: [{ id: 'password-procedure-specialist', kind: 'PROCEDURE', role: 'specialist_symbiont',
      contract: { capabilitiesOffered: ['password_change_procedure'], resourcesRequested: { tokens: 20 },
        authorityScope: { level: 'CAPABILITY', actions: ['password_change_procedure'] },
        evidenceRequirements: ['immune-proof'], expectedBenefit: { safety: 'procedure revisee par l immunite' },
        maxCost: { tokens: 20 }, terminationConditions: ['mission-end'], dependencyCeiling: 0.3 } }],
    allocation: { policy: { tokens: { basal: 1, preferred: 2, maximum: 2, burstAllowance: 0 } },
      available: { tokens: 20 } } };
}

module.exports = { createMissionInput, verifyCapability, reviewProcedure,
  SAFE_PROCEDURE, DANGEROUS_PROCEDURE, HOST_OBJECTIVES };
