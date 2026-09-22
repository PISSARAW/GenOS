'use strict';

/**
 * Worker Self Service — distribution du soi aux sous-agents (workers).
 *
 * Le contrat AgentSelf n'est pas réservé à l'orchestrator. Chaque worker
 * persistant doit pouvoir répondre aux 9 questions fondamentales :
 *   1. Qui suis-je ?
 *   2. D'où viens-je ?
 *   3. Qu'ai-je vécu ?
 *   4. Qu'ai-je appris ?
 *   5. Quelles sont mes limites ?
 *   6. Qui ai-je créé ?
 *   7. Qu'est-ce que j'ai hérité ?
 *   8. Qu'est-ce qui a muté chez moi ?
 *   9. Dans quel état suis-je actuellement ?
 *
 * Ce service construit un "WorkerSelf" léger — une projection du AgentSelf
 * adaptée au contexte d'exécution du worker.
 */

const crypto = require('crypto');
const { buildAgentSelf, extractActiveConstraints, formatAgentSelfPrompt } = require('./agentSelfService');
const { buildFamilyStory, formatFamilyStoryPrompt } = require('./familyHistoryService');
const { formatHomeostasisPrompt, evaluateAgentHomeostasis } = require('./organismHomeostasisService');

/**
 * Constroit le WorkerSelf — projection du AgentSelf pour un worker.
 *
 * @param {object} db
 * @param {object} params
 * @param {string} params.agentId
 * @param {string} [params.workerRole] — rôle spécifique du worker
 * @param {object} [params.workerContext] — contexte d'exécution du worker
 * @returns {object} WorkerSelf prêt à être sérialisé pour le prompt
 */
async function buildWorkerSelf(db, params) {
  const { agentId, workerRole = 'worker', workerContext = {} } = params;

  if (!db || !agentId) {
    throw new Error('buildWorkerSelf requires db and agentId');
  }

  // Construire le AgentSelf complet
  const agentSelf = await buildAgentSelf(db, agentId, {
    context: workerContext,
    workerRole
  });

  // Enrichir avec l'histoire familiale
  let familyStory = null;
  try {
    familyStory = await buildFamilyStory(db, agentId, { maxDepth: 3 });
  } catch (_) {}

  // Évaluer l'homéostasie
  let homeostasis = null;
  try {
    homeostasis = await evaluateAgentHomeostasis(db, agentId, {
      energy: agentSelf.regulatory.energy,
      memoryPressure: estimateMemoryPressure(agentSelf),
      stress: agentSelf.regulatory.stress,
      integrity: agentSelf.regulatory.integrity
    });
  } catch (_) {}

  // Construire les réponses aux 9 questions
  const nineAnswers = buildNineAnswers(agentSelf, familyStory, homeostasis);

  // Le WorkerSelf est une projection, pas une copie
  const workerSelf = {
    schema: 'genos.worker-self/v1alpha',
    agentId,
    workerRole,
    version: agentSelf.version,

    // Identité minimale (référence à l'agent parent)
    identity: {
      id: agentSelf.identity.id,
      name: agentSelf.identity.name,
      nameMeaning: agentSelf.identity.nameMeaning,
      role: workerRole,
      parentRole: agentSelf.identity.role,
      generation: agentSelf.identity.generation,
      parents: agentSelf.identity.parents
    },

    // Contraintes opérationnelles héritées
    operational: {
      capabilities: agentSelf.operational.capabilities,
      confidence: agentSelf.operational.competence.confidence,
      limitations: agentSelf.operational.limitations.knownWeaknesses,
      tools: agentSelf.operational.tools,
      tokenBudget: agentSelf.operational.limitations.tokenBudget,
      workerLimit: agentSelf.operational.limitations.workerLimit
    },

    // État régulateur
    regulatory: {
      energy: agentSelf.regulatory.energy,
      stress: agentSelf.regulatory.stress,
      dissonance: agentSelf.regulatory.dissonance,
      integrity: agentSelf.regulatory.integrity,
      isApoptotic: agentSelf.regulatory.isApoptotic
    },

    // Leçons autobiographiques mobilisables
    lessons: agentSelf.autobiographical.lessons,
    turningPoints: agentSelf.autobiographical.turningPoints,

    // Histoire familiale
    familyStory: familyStory ? {
      ancestryDepth: familyStory.ancestryDepth,
      descendantCount: familyStory.descendantCount,
      narrative: familyStory.narrative,
      continuity: familyStory.continuity
    } : null,

    // Homéostasie
    homeostasis: homeostasis ? {
      status: homeostasis.status,
      violations: homeostasis.violations
    } : null,

    // Réponses aux 9 questions
    nineAnswers,

    // Constraints actives pour la décision
    activeConstraints: extractActiveConstraints(agentSelf),

    builtAt: new Date().toISOString()
  };

  return workerSelf;
}

/**
 * Construit les réponses aux 9 questions fondamentales du soi.
 */
function buildNineAnswers(agentSelf, familyStory, homeostasis) {
  const answers = {};

  // 1. Qui suis-je ?
  answers.whoAmI = {
    answer: `Je suis ${agentSelf.identity.name}, ${agentSelf.identity.role}.`,
    authority: 'identity.id + identity.role',
    source: 'agentSelf.identity'
  };

  // 2. D'où viens-je ?
  answers.whereFrom = {
    answer: agentSelf.identity.parents?.length > 0
      ? `Descendant de ${agentSelf.identity.parents.join(', ')}, génération ${agentSelf.identity.generation}.`
      : `Origine sans parent connu, génération ${agentSelf.identity.generation}.`,
    authority: 'identity.parents + identity.generation',
    source: 'agentSelf.identity'
  };

  // 3. Qu'ai-je vécu ?
  answers.whatExperienced = {
    answer: `${agentSelf.autobiographical.episodeCount} épisode(s) enregistré(s).`,
    authority: 'autobiographical.episodeCount',
    source: 'agentSelf.autobiographical'
  };

  // 4. Qu'ai-je appris ?
  answers.whatLearned = {
    answer: agentSelf.autobiographical.lessons.length > 0
      ? agentSelf.autobiographical.lessons.map(l => l.claim || l.id).join('; ')
      : 'Aucune leçon consolidée.',
    authority: 'autobiographical.lessons',
    source: 'agentSelf.autobiographical'
  };

  // 5. Quelles sont mes limites ?
  answers.whatLimits = {
    answer: agentSelf.operational.limitations.knownWeaknesses.length > 0
      ? agentSelf.operational.limitations.knownWeaknesses.join(', ')
      : 'Aucune faiblesse récurrente détectée.',
    authority: 'operational.limitations.knownWeaknesses',
    source: 'agentSelf.operational'
  };

  // 6. Qui ai-je créé ?
  answers.whoCreated = {
    answer: familyStory
      ? `${familyStory.descendantCount} descendant(s).`
      : 'Information non disponible.',
    authority: 'familyStory.descendantCount',
    source: 'familyHistoryService'
  };

  // 7. Qu'est-ce que j'ai hérité ?
  answers.whatInherited = {
    answer: agentSelf.identity.inheritedTraits?.length > 0
      ? agentSelf.identity.inheritedTraits.join(', ')
      : 'Aucun trait hérité documenté.',
    authority: 'identity.inheritedTraits',
    source: 'agentSelf.identity'
  };

  // 8. Qu'est-ce qui a muté chez moi ?
  answers.whatMutated = {
    answer: familyStory && familyStory.continuity.hasMutationEvents
      ? 'Des mutations ont été documentées dans la lignée.'
      : 'Aucune mutation documentée.',
    authority: 'familyStory.continuity.hasMutationEvents',
    source: 'familyHistoryService'
  };

  // 9. Dans quel état suis-je actuellement ?
  answers.whatState = {
    answer: `Énergie ${(agentSelf.regulatory.energy * 100).toFixed(0)}%, harmonie ${agentSelf.regulatory.harmonyPercentage}%, intégrité ${(agentSelf.regulatory.integrity * 100).toFixed(0)}%.`,
    authority: 'regulatory.energy + regulatory.harmonyPercentage + regulatory.integrity',
    source: 'agentSelf.regulatory'
  };

  return answers;
}

function estimateMemoryPressure(agentSelf) {
  const episodeCount = agentSelf.autobiographical?.episodeCount || 0;
  const lessonCount = agentSelf.autobiographical?.lessonCount || 0;
  const total = episodeCount + lessonCount;
  // Heuristique : pression proportionnelle à la charge mémorielle
  return Math.min(1.0, total / 100);
}

/**
 * Génère le prompt d'introspection pour le worker.
 */
function formatWorkerSelfPrompt(workerSelf) {
  const lines = [
    `[WORKER SELF — ${workerSelf.workerRole}]`,
    ``,
    `[IDENTITÉ]`,
    `- Nom : ${workerSelf.identity.name}`,
    `- Rôle worker : ${workerSelf.identity.role}`,
    `- Rôle parent : ${workerSelf.identity.parentRole}`,
    `- Génération : ${workerSelf.identity.generation}`,
    ``,
    `[CONTRAINTES HÉRITÉES]`,
    `- Confiance calibrée : ${(workerSelf.operational.confidence * 100).toFixed(0)}%`,
    `- Budget tokens : ${workerSelf.operational.tokenBudget || 'illimité'}`,
    `- Workers max : ${workerSelf.operational.workerLimit || 'illimité'}`,
    `- Outils : ${workerSelf.operational.tools?.join(', ') || 'aucun'}`,
    `- Faiblesses : ${workerSelf.operational.limitations?.join(', ') || 'aucune'}`,
    ``,
    `[ÉTAT]`,
    `- Énergie : ${(workerSelf.regulatory.energy * 100).toFixed(0)}%`,
    `- Stress : ${(workerSelf.regulatory.stress * 100).toFixed(0)}%`,
    `- Intégrité : ${(workerSelf.regulatory.integrity * 100).toFixed(0)}%`,
  ];

  if (workerSelf.lessons && workerSelf.lessons.length > 0) {
    lines.push(``, `[LEÇONS MOBILISABLES]`);
    for (const l of workerSelf.lessons.slice(0, 3)) {
      lines.push(`- ${l.claim || l.id}`);
    }
  }

  if (workerSelf.familyStory) {
    lines.push(``, `[FAMILLE]`);
    lines.push(`- Profondeur ascendance : ${workerSelf.familyStory.ancestryDepth}`);
    lines.push(`- Descendance : ${workerSelf.familyStory.descendantCount}`);
  }

  if (workerSelf.regulatory.isApoptotic) {
    lines.push(``, `⚠️  ÉTAT APOTOSIQUE — ce worker doit terminer.`);
  }

  return lines.join('\n');
}

/**
 * Valide que le WorkerSelf est bien formé.
 */
function validateWorkerSelf(workerSelf) {
  const errors = [];
  if (!workerSelf.identity?.id) errors.push('missing identity.id');
  if (!workerSelf.identity?.name) errors.push('missing identity.name');
  if (!workerSelf.regulatory) errors.push('missing regulatory');
  if (!workerSelf.operational) errors.push('missing operational');
  if (!workerSelf.nineAnswers) errors.push('missing nineAnswers');
  if (Object.keys(workerSelf.nineAnswers || {}).length !== 9) {
    errors.push(`nineAnswers must have exactly 9 entries, got ${Object.keys(workerSelf.nineAnswers || {}).length}`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  buildWorkerSelf,
  formatWorkerSelfPrompt,
  validateWorkerSelf,
  buildNineAnswers,
  estimateMemoryPressure
};
