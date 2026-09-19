'use strict';

/**
 * Speculative Realism Service — réalisme spéculatif, corréationnalisme, absolu.
 *
 * Mapping GenOS :
 *  - Corréationnalisme : l'objet est toujours corrélé à un sujet ; l'absolu est inaccessible.
 *  - Speculative Realism : tentative de penser l'objet en dehors de la corrélation sujet-experience.
 *  - Absolu : ce qui existe indépendamment de toute expérience agentique.
 *
 * Référence :
 *  - Speculative Realism : Quentin Meillassoux, Ray Brassier, Iain Hamilton Grant, Graham Harman.
 *  - Corréationnalisme : Kant, hétériques du xxie siècle.
 *  - Absolu : moi sans sujet, principales du sufficient reason sans sujet.
 */

const { text, evidence } = require('./ontologyContracts');

/**
 * analyzeCorrelationLimit — analyse les limites de la corrélation sujet-experience.
 *
 * Retourne les termes, la limite de corrélation, et l'état d'évidence.
 */
function analyzeCorrelationLimit(input = {}) {
  const objectId = text(input.objectId || input.subject, 'objectId');
  const observerId = text(input.observerId || input.observer, 'observerId');
  const claim = text(input.claim || 'object_independent_of_observer', 'claim');
  const accessMode = text(input.accessMode || 'indirect', 'accessMode');
  const correlationRisk = Number(input.correlationRisk);
  const boundedRisk = Number.isFinite(correlationRisk)
    ? Math.max(0, Math.min(1, correlationRisk))
    : 0.5;
  return {
    objectId,
    observerId,
    claim,
    accessMode,
    correlationRisk: boundedRisk,
    evidence: evidence(input.evidence),
    limitation: 'L\'analyse distingue l\'objet et son accès sans établir une ontologie définitive.',
  };
}

/**
 * compareAccessModes — compare les modes d'accès à un objet.
 *
 * Retourne les modes, l'affirmation d'indépendance, et l'état d'évidence.
 */
function compareAccessModes(input = {}) {
  const objectId = text(input.objectId || input.subject, 'objectId');
  const modes = Array.isArray(input.modes) ? input.modes : ['direct', 'indirect', 'inferential'];
  return {
    objectId,
    modes,
    independentClaim: false,
    evidenceStatus: 'unverified',
  };
}

/**
 * speculativeRealistClaim — évalue une revendication de réalisme spéculatif.
 *
 * Retourne la position avec les prémisses, conclusion, et état d'évidence.
 */
function speculativeRealistClaim(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const objectOfThought = text(input.objectOfThought || input.object, 'objectOfThought');
  const premises = Array.isArray(input.premises) ? input.premises : [
    'L\'objet existe indépendamment de toute corréation avec un sujet.',
    'La pensée peut accéder à l\'absolu sans être limitée par la condition de l\'experience.',
  ];
  const conclusion = 'Le réalisme spéculatif prétend penser l\'objet hors de la corréation sujet-experience.';
  return {
    subjectId,
    objectOfThought,
    position: 'speculative-realism',
    premises,
    conclusion,
    evidence: evidence(input.evidence),
    limitation: 'Cette évaluation formalise la revendication ; le runtime ne démontre pas l\'accès à l\'absolu.',
  };
}

/**
 * correlateVsAbsolute — compare corréationnalisme et réalisme spéculatif.
 *
 * Retourne une synthèse comparative.
 */
function correlateVsAbsolute(input = {}) {
  const objectId = text(input.objectId || input.subject, 'objectId');
  const observerId = text(input.observerId || input.observer, 'observerId');
  const correlation = analyzeCorrelationLimit({ objectId, observerId, ...input });
  const speculation = speculativeRealistClaim({ subjectId: objectId, objectOfThought: objectId, ...input });
  return {
    objectId,
    correlation,
    speculation,
    comparison: 'Le corréationnalisme maintient l\'objet dans la corréation ; le réalisme spéculatif tente de le penser absolument.',
    evidence: evidence(input.evidence),
    limitation: 'La comparaison est conceptuelle ; aucune preuve runtime ne tranchait.',
  };
}

function bounded(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

module.exports = {
  analyzeCorrelationLimit,
  compareAccessModes,
  speculativeRealistClaim,
  correlateVsAbsolute,
  bounded,
};
