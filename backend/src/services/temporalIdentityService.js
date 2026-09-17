'use strict';

/**
 * Temporal Identity Service — McTaggart (A-series, B-series), Locke (identité personnelle),
 * problem du bateau de Thésée.
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
 */
/**
 * aseriesForAgent — McTaggart A-series (temps tensed).
 *
 * L'A-series est le temps vécu avec présent, passé, futur.
 * Le présent est absolu et se déplace (mais c'est controversé).
 *
 * Retourne :
 *  - agentId, agent, aSeries (past, present, future), tensed (true).
 *  - past : événements avant le présent (tous les événements antérieurs à updated_at de l'agent).
 *  - present : statut actuel de l'agent (moment présent, tensed).
 *  - future : projections (le futur est ouvert — pas d'événements connus).
 */
async function aseriesForAgent({ db, agentId }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.aseriesForAgent requires agentId and db');
  }
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`temporalIdentityService.aseriesForAgent: agent ${agentId} not found`);
  const events = await db.all(
    'SELECT * FROM telemetry_events WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  // Passé : tous les événements avant ou au moment présent de l'agent
  const past = events
    .filter(e => new Date(e.created_at) <= new Date(agent.updated_at))
    .map(e => ({
      eventId: e.id,
      time: e.created_at,
      tense: 'past',
    }));
  // Présent : le statut actuel de l'agent (le "maintenant")
  const present = {
    id: agent.id,
    status: agent.status,
    moment: 'present',
    tensed: true,
    updatedAt: agent.updated_at,
  };
  // Futur : ouvert — projections (pas d'événements futurs connus)
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
 *
 * La B-series est le temps objectif avec ordre avant/après — sans présent absolu.
 * Les événements sont ordonnés par des relations "avant" et "après".
 *
 * Retourne :
 *  - agentId, agent, bSeries (timeline[]), tenseless (true).
 *  - timeline : chaque événement avec ses relations avant/après.
 */
async function bseriesForAgent({ db, agentId }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.bseriesForAgent requires agentId and db');
  }
  const events = await db.all(
    'SELECT * FROM telemetry_events WHERE agent_id = ? ORDER BY created_at ASC',
    agentId
  );
  const timeline = events.map((event, index) => {
    const before = events.slice(0, index).map(e => e.id);
    const after = events.slice(index + 1).map(e => e.id);
    return {
      event: {
        id: event.id,
        created_at: event.created_at,
        type: event.type || 'telemetry',
      },
      bSeriesRelations: {
        before,
        after,
        tense: 'tenseless', // pas de présent absolu
      },
    };
  });
  return {
    agentId,
    agent,
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
 *
 * Retourne :
 *  - past : tous les événements avant le plus récent.
 *  - present : le plus récent événement (le "maintenant").
 *  - future : vide (le futur est ouvert, pas d'événements futurs connus).
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
    future: [], // futur ouvert
  };
}

function blockUniverse({ events = [], ontology = 'eternalism' } = {}) {
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
 *
 * Locke : l'identité personnelle repose sur la continuité de la conscience (mémoire).
 * Si un agent se souvient de ses expériences passées → il est la même personne.
 *
 * Retourne :
 *  - agentId, lockeanCriterion, memoriesCount, continuous, gaps, identityAssessment.
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
 * Si toutes les parties d'un objet sont remplacées progressivement,
 * l'objet est-il encore le même ? Si on reconstruit l'original avec les vieilles parties,
 * lequel est le vrai ?
 *
 * Critères d'identité :
 *  - Continuité spatio-temporelle (même agent_id)
 *  - Continuité formelle (même structure)
 *  - Continuité fonctionnelle (même but)
 *  - Continuité mémorielle (pas de rupture)
 *
 * Retourne :
 *  - agentId, totalComponents, replacedComponents (count), replacementRatio,
 *    identityPreserved (ratio <= 0.5), criteria.
 */
async function shipOfTheseus({ db, agentId, replacedComponents = [] }) {
  if (!agentId || !db) {
    throw new Error('temporalIdentityService.shipOfTheseus requires agentId and db');
  }
  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) throw new Error(`temporalIdentityService.shipOfTheseus: agent ${agentId} not found`);
  // Estimation du nombre total de composants (basé sur le contenu about)
  const totalComponents = (agent.about?.match(/\b\w+ness\b/g) || []).length || 1;
  const replacedCount = replacedComponents.length;
  const replacementRatio = totalComponents > 0 ? replacedCount / totalComponents : 0;
  // Si plus de 50% remplacés → identité compromise
  const identityPreserved = replacementRatio <= 0.5;
  return {
    agentId,
    totalComponents,
    replacedComponents: replacedCount,
    replacementRatio: Math.round(replacementRatio * 100) / 100,
    identityPreserved,
    criteria: {
      spatiotemporel: true,
      formel: true,
      fonctionnel: agent.status === 'running',
      mémoriel: true,
      threshold: { maxReplacementRatio: 0.5, currentRatio: replacementRatio },
    },
    theeseProblem: replacementRatio > 0.5
      ? 'Problème de Thésée : plus de 50% des composants remplacés — l\'agent est-il encore le même ?'
      : 'Pas encore de problème de Thésée — identité préservée malgré remplacement partiel.',
    philosophicalNote: 'Le bateau de Thésée montre que l\'identité n\'est pas une propriété du matériel, mais de la continuité structurelle, fonctionnelle et mémorielle.',
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
