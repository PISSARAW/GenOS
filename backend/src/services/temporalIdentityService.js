'use strict';

/**
 * Temporal Identity Service — McTaggart (A-series, B-series), Locke (identité personnelle),
 * problème du bateau de Thésée.
 *
 * Mapping philosophique :
 *  - McTaggart (A-series) : temps subjectif avec présent, passé, futur (tensed time).
 *    Le présent est absolu et se déplace — controversé (paradoxe du temps).
 *  - McTaggart (B-series) : temps objectif avec ordre avant/après (tenseless time).
 *    Pas de présent absolu — juste des relations d'ordre entre événements.
 *  - Locke (identité personnelle) : la continuité de la mémoire définit l'identité personnelle.
 *    Un agent est la même personne si elle se souvient de ses expériences passées.
 *  - Bateau de Thésée : le problème de l'identité par changement graduel.
 *    Si toutes les parties sont remplacées, l'objet est-il encore le même ?
 *    Critères d'identité : continuité spatio-temporelle, formelle, fonctionnelle, mémorielle.
 *
 * invariant : aucun verdict d'identité global n'est émis. Le service retourne
 * des évaluations dimensionnelles ; le jugement finale appartient au contexte.
 */

/**
 * aseriesForAgent — McTaggart A-series (temps tensed).
 *
 * Retourne :
 *  - agentId, agent, aSeries (past, present, future), tensed (true).
 */
async function aseriesForAgent({ db, agentId }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.aseriesForAgent requires agentId and db');
  }
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`temporalIdentityService.aseriesForAgent: agent ${agentId} not found`);
  const events = await db.all(
    'SELECT id, created_at, event_type FROM telemetry_events WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  const agentUpdatedAt = String(agent.updated_at);
  const past = events
    .filter(e => String(e.created_at) <= agentUpdatedAt)
    .map(e => ({
      eventId: e.id,
      time: e.created_at,
      tense: 'past',
    }));
  const present = {
    id: agent.id,
    status: agent.status,
    moment: 'present',
    tensed: true,
    updatedAt: agent.updated_at,
  };
  const future = [
    {
      projection: 'future',
      tense: 'future',
      description: 'L\'agent est projeté vers des missions futures — le futur est ouvert.',
      open: true,
    },
  ];
  return {
    agentId,
    agent,
    aSeries: {
      type: 'A-series (tensed time)',
      mctaggartClaim: 'Le temps est structuré par le présent, le passé, le futur — des positions tensed.',
      past,
      present,
      future,
      tensed: true,
    },
    philosophicalNote: 'L\'A-series de McTaggart est controversé car le présent semble avoir des propriétés contradictoires (être futur, présent et passé à la fois).',
  };
}

/**
 * bseriesForAgent — McTaggart B-series (temps tenseless).
 */
async function bseriesForAgent({ db, agentId }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.bseriesForAgent requires agentId and db');
  }
  const events = await db.all(
    'SELECT id, created_at, event_type FROM telemetry_events WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  const timeline = events.map((event, index) => {
    const before = events.slice(0, index).map(e => e.id);
    const after = events.slice(index + 1).map(e => e.id);
    return {
      event: {
        id: event.id,
        created_at: event.created_at,
        type: event.event_type || 'telemetry',
      },
      bSeriesRelations: {
        before,
        after,
        tense: 'tenseless',
      },
    };
  });
  return {
    agentId,
    bSeries: {
      type: 'B-series (tenseless time)',
      mctaggartClaim: 'Le temps est un ordre d\'événements "avant" et "après" — sans présent absolu.',
      timeline,
      tenseless: true,
      order: 'chronological',
    },
    philosophicalNote: 'La B-series est défendue par les théories tenseless du temps (eutemps, eternalisme). Le présent est relatif, pas absolu.',
  };
}

/**
 * aSeriesPosition — calcule la position A-series d'un événement.
 */
function aSeriesPosition(events) {
  if (!Array.isArray(events) || events.length === 0) {
    return { past: [], present: null, future: [] };
  }
  const sorted = [...events].sort((a, b) => {
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return da - db;
  });
  const present = sorted[sorted.length - 1];
  const past = sorted.slice(0, -1);
  return {
    past,
    present: present ? { ...present, tense: 'present', isPresent: true } : null,
    future: [],
  };
}

function blockUniverse({ events = [], ontology = 'eternalism' } = {}) {
  ontology = ontology || 'eternalism';
  if (!['eternalism', 'presentism'].includes(ontology)) {
    throw new Error(`temporalIdentityService.blockUniverse invalid ontology: ${ontology}`);
  }
  return { events, ontology, presentIsFundamental: ontology === 'presentism', allTimesEquallyReal: ontology === 'eternalism' };
}

function arrowOfTime({ events = [], direction = 'increasing_entropy' } = {}) {
  return { events, direction, asymmetric: true, ordered: Array.isArray(events) ? events : [], description: 'La fleche du temps exprime une asymetrie orientee des processus.' };
}

function spacetimeRelativity({ events = [], observer = 'default' } = {}) {
  return { events, observer, framework: 'spacetime', absoluteTime: false, invariant: 'causal_structure', description: 'Les mesures temporelles dependent de l observateur dans un espace-temps relativiste.' };
}

/**
 * checkMemoryContinuity — Locke (identité personnelle par continuité de mémoire).
 */
async function checkMemoryContinuity({ db, agentId }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.checkMemoryContinuity requires agentId and db');
  }
  const memories = await db.all(
    'SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  let continuous = true;
  const gaps = [];
  for (let i = 1; i < memories.length; i++) {
    const prev = new Date(memories[i - 1].created_at);
    const curr = new Date(memories[i].created_at);
    const gapDays = (curr - prev) / (1000 * 60 * 60 * 24);
    if (gapDays > 1) {
      continuous = false;
      gaps.push({
        from: memories[i - 1].created_at,
        to: memories[i].created_at,
        gapDays: Math.round(gapDays * 10) / 10,
        lockeanProblem: 'Rupture de mémoire — Locke : l\'agent se souvient-il de cette période ?',
      });
    }
  }
  return {
    agentId,
    lockeanCriterion: 'Continuité de la mémoire = identité personnelle (Locke).',
    memoriesCount: memories.length,
    continuous,
    gaps: gaps.length > 0 ? gaps : [],
    identityAssessment: continuous
      ? 'Identité personnelle préservée — continuité de mémoire sans rupture (Locke).'
      : 'Identité personnelle remise en question — ruptures de mémoire détectées.',
    lockeQuote: 'L\'identité personnelle consiste dans la continuité de la conscience (mémoire) — Locke, Essay Concerning Human Understanding.',
  };
}

/**
 * shipOfTheseus — problème du bateau de Thésée.
 *
 * Retourne des évaluations dimensionnelles, sans verdict global d'identité.
 * Le seuil de remplacement n'est plus utilisé pour trancher `identityPreserved`.
 */
async function shipOfTheseus({ db, agentId, replacedComponents = [] }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.shipOfTheseus requires agentId and db');
  }
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`temporalIdentityService.shipOfTheseus: agent ${agentId} not found`);
  const totalComponents = (agent.about?.match(/\b\w+ness\b/g) || []).length || 1;
  const replacedCount = replacedComponents.length;
  const replacementRatio = totalComponents > 0 ? replacedCount / totalComponents : 0;

  return {
    agentId,
    totalComponents,
    replacedComponents: replacedCount,
    replacementRatio: Math.round(replacementRatio * 100) / 100,
    dimensions: {
      spatiotemporel: true,
      formel: true,
      fonctionnel: agent.status === 'running',
      mémoriel: true,
    },
    replacementAssessment: {
      replaced: replacedCount,
      total: totalComponents,
      ratio: Math.round(replacementRatio * 100) / 100,
      threshold: { maxReplacementRatio: 0.5, currentRatio: replacementRatio },
      problem: replacementRatio > 0.5
        ? 'Plus de 50% des composants remplacés — le problème de Thésée se pose : laquelle des deux entités est le vrai bateau ?'
        : 'Remplacement partiel — pas encore de problème de Thésée avéré.',
    },
    philosophicalNote: 'Le bateau de Thésée montre que l\'identité n\'est pas une propriété du matériel, mais de la continuité structurelle, fonctionnelle et mémorielle. GenOS ne tranche pas ; il expose les dimensions.',
  };
}

module.exports = {
  aseriesForAgent,
  bseriesForAgent,
  aSeriesPosition,
  blockUniverse,
  arrowOfTime,
  spacetimeRelativity,
  checkMemoryContinuity,
  shipOfTheseus,
};
