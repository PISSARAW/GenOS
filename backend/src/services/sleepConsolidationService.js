'use strict';

/**
 * Consolidation offline SHY de la mémoire autobiographique (par agent).
 *
 * Hypothèse d'homéostasie synaptique (Tononi & Cirelli) : renormalisation
 * proportionnelle (salience × facteur) qui préserve l'ordre relatif
 * (rapport signal/bruit amélioré) + oubli sous epsilon. Le cycle synaptique
 * global existe déjà (sleepCycle.runSleepCycle, sur demande) ; ce module est
 * le passage offline automatique par agent, déclenché à la fin de mission
 * (agent idle) depuis agentProcessOutcome.finalizeChildClose.
 * Les leçons (règles falsifiables) ne décroissent jamais silencieusement.
 */

const DEFAULT_DECAY = 0.9;
const DEFAULT_FORGET_BELOW = 0.05;

function optionsOf(options) {
  const settings = options || {};
  const decay = Number(settings.decayFactor);
  const floor = Number(settings.forgetBelow);
  return {
    decay: Number.isFinite(decay) && decay > 0 && decay < 1 ? decay : DEFAULT_DECAY,
    floor: Number.isFinite(floor) && floor >= 0 ? floor : DEFAULT_FORGET_BELOW
  };
}

async function statsOf(db, agentId) {
  const row = await db.get(
    `SELECT COUNT(*) AS seen, COALESCE(AVG(salience), 0) AS mean FROM autobiographical_episodes WHERE agent_id = ? AND is_forgotten = 0`,
    agentId
  );
  return { seen: Number(row?.seen) || 0, mean: Number(row?.mean) || 0 };
}

async function consolidateAgent(db, agentId, options) {
  if (!db || !agentId) throw new Error('consolidateAgent requires db and agentId');
  const { decay, floor } = optionsOf(options);
  const before = await statsOf(db, agentId);
  if (!before.seen) return { agentId, renormalized: 0, forgotten: 0, meanBefore: 0, meanAfter: 0 };
  await db.run(
    `UPDATE autobiographical_episodes SET salience = ROUND(salience * ?, 4) WHERE agent_id = ? AND is_forgotten = 0`,
    decay, agentId
  );
  const forgotten = await db.run(
    `UPDATE autobiographical_episodes SET is_forgotten = 1 WHERE agent_id = ? AND is_forgotten = 0 AND salience < ?`,
    agentId, floor
  );
  const after = await statsOf(db, agentId);
  return {
    agentId,
    renormalized: before.seen,
    forgotten: Number(forgotten?.changes) || 0,
    meanBefore: before.mean,
    meanAfter: after.mean
  };
}

module.exports = { consolidateAgent, DEFAULT_DECAY, DEFAULT_FORGET_BELOW };
