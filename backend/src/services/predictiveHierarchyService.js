'use strict';

/**
 * Hiérarchie prédictive Mission > Stratégie > Action (+ local MMN).
 *
 * Chaque niveau prédit le suivant ; seule l'erreur pondérée par précision
 * remonte (jamais d'écrasement direct du haut par le brut du bas).
 * Règle de promotion (Badre) : 3 erreurs Action ⇒ révision Stratégie
 * demandée, 3 révisions Stratégie ⇒ réexamen Mission. Niveau local
 * (artefact/diff/schema : MMN) absorbé sans propagation. La précision
 * d'un niveau décroît avec ses erreurs (1/(1+n)). Avis seulement :
 * émet des événements de révision, ne mute aucun plan.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const SCOPE = 'predictive_hierarchy';
const PROMOTE_AFTER = 3;

function classifyLevel(event) {
  const type = String(event?.eventType || '');
  if (/ARTIFACT|DIFF|PATCH|SCHEMA|SNAPSHOT/i.test(type)) return 'local';
  if (/STRATEGY_|HYPOTHESIS|AUTONOMY_|PLAN_CREATED/i.test(type)) return 'strategy';
  if (/^MISSION_|ORCHESTRATION_|TRINITY_|PROMOTION_/i.test(type)) return 'mission';
  if (/FAILED|_ERROR$/i.test(type)) return 'action';
  if (/HALTED|BLOCKED|EXHAUSTED/i.test(type)) return 'action';
  return null;
}

function baseSurprise(event) {
  const type = String(event?.eventType || '');
  const severity = String(event?.severity || '');
  if (/FAILED|_ERROR$/i.test(type)) return 1;
  if (/HALTED|BLOCKED|EXHAUSTED/i.test(type)) return 0.5;
  if (/STRATEGY_|HYPOTHESIS/i.test(type)) {
    return severity === 'error' || severity === 'critical' ? 0.5 : 0;
  }
  return 0;
}

function precisionOf(counters, level) {
  const errors = level === 'strategy'
    ? Number(counters.strategyRevisions) || 0
    : Number(counters.actionErrors) || 0;
  return 1 / (1 + errors);
}

async function countersOf(db, agentId) {
  const stored = (await new AdaptiveStateService(db).restoreObject(SCOPE, agentId)) || {};
  return {
    actionErrors: Math.max(0, Math.floor(Number(stored.actionErrors) || 0)),
    strategyRevisions: Math.max(0, Math.floor(Number(stored.strategyRevisions) || 0))
  };
}

async function routeEvent(db, agentId, event) {
  const level = classifyLevel(event || {});
  if (!level) return null;
  if (level === 'local') return { level, precision: 1, surprise: 0, propagate: null };
  if (level === 'mission') return { level, precision: 1, surprise: baseSurprise(event), propagate: null };
  if (!db || !agentId) return { level, precision: 1, surprise: 0, propagate: null };
  try {
    const surprise = baseSurprise(event);
    const counters = await countersOf(db, agentId);
    const precision = precisionOf(counters, level);
    if (surprise < 0.5) return { level, precision, surprise, propagate: null };
    if (level === 'action') counters.actionErrors += 1;
    else counters.strategyRevisions += 1;
    let propagate = null;
    if (counters.actionErrors >= PROMOTE_AFTER) {
      counters.actionErrors = 0;
      counters.strategyRevisions += 1;
      propagate = 'strategy';
    }
    if (counters.strategyRevisions >= PROMOTE_AFTER) {
      counters.strategyRevisions = 0;
      propagate = 'mission';
    }
    const store = new AdaptiveStateService(db);
    await store.persistObject(SCOPE, agentId, counters, counters.actionErrors + counters.strategyRevisions);
    return { level, precision, surprise, propagate, counters };
  } catch (_) {
    return null;
  }
}

module.exports = { classifyLevel, routeEvent, PROMOTE_AFTER };
