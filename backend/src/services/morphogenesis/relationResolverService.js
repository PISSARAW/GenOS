'use strict';

const { listRelations, deriveProperties } = require('../crossAgentRelationalService');

const EXTENDED_RELATION_TYPES = Object.freeze([
  'stranger', 'neighbor', 'bonded_partner', 'rival', 'temporary_ally',
  'client', 'supplier', 'guardian', 'dependent'
]);

const EXTENDED_RELATION_PRESETS = Object.freeze({
  stranger: { familiarity: 0, sharedHistory: 0, authority: 0, trustForDomain: 0, commonGround: 0, epistemicIndependence: 1, errorCorrelation: 0, disclosureLevel: 0.3 },
  neighbor: { familiarity: 0.3, sharedHistory: 0.2, authority: 0.3, trustForDomain: 0.4, commonGround: 0.3, epistemicIndependence: 0.7, errorCorrelation: 0.3, disclosureLevel: 0.5 },
  bonded_partner: { familiarity: 0.8, sharedHistory: 0.7, authority: 0.5, trustForDomain: 0.8, commonGround: 0.7, epistemicIndependence: 0.4, errorCorrelation: 0.5, disclosureLevel: 0.7 },
  rival: { familiarity: 0.4, sharedHistory: 0.3, authority: 0.3, trustForDomain: 0.2, commonGround: 0.2, epistemicIndependence: 0.9, errorCorrelation: 0.1, disclosureLevel: 0.2 },
  temporary_ally: { familiarity: 0.3, sharedHistory: 0.2, authority: 0.3, trustForDomain: 0.4, commonGround: 0.3, epistemicIndependence: 0.6, errorCorrelation: 0.3, disclosureLevel: 0.4 },
  client: { familiarity: 0.4, sharedHistory: 0.3, authority: 0.2, trustForDomain: 0.5, commonGround: 0.4, epistemicIndependence: 0.5, errorCorrelation: 0.4, disclosureLevel: 0.5 },
  supplier: { familiarity: 0.4, sharedHistory: 0.3, authority: 0.4, trustForDomain: 0.5, commonGround: 0.4, epistemicIndependence: 0.5, errorCorrelation: 0.4, disclosureLevel: 0.5 },
  guardian: { familiarity: 0.6, sharedHistory: 0.5, authority: 0.7, trustForDomain: 0.6, commonGround: 0.5, epistemicIndependence: 0.3, errorCorrelation: 0.5, disclosureLevel: 0.6 },
  dependent: { familiarity: 0.5, sharedHistory: 0.4, authority: 0.2, trustForDomain: 0.4, commonGround: 0.4, epistemicIndependence: 0.3, errorCorrelation: 0.5, disclosureLevel: 0.5 }
});

const LINEAGE_TYPES = new Set(['parent', 'child', 'ancestor', 'descendant']);

function isLineageRelation(relationType) {
  return LINEAGE_TYPES.has(relationType);
}

function getExtendedProperties(relationType) {
  const preset = EXTENDED_RELATION_PRESETS[relationType];
  if (preset) return Object.assign({}, preset);
  return deriveProperties(relationType);
}

function buildReasons(candidate) {
  const reasons = [];
  if ((candidate.domainCompetence ?? 0) > 0.7) reasons.push(`domain competence: ${(candidate.domainCompetence ?? 0).toFixed(2)}`);
  if ((candidate.epistemicIndependence ?? 0) > 0.7) reasons.push(`epistemic independence: ${(candidate.epistemicIndependence ?? 0).toFixed(2)}`);
  if ((candidate.errorCorrelation ?? 0) < 0.3) reasons.push(`low error correlation: ${(candidate.errorCorrelation ?? 0).toFixed(2)}`);
  return reasons;
}

function scoreRelation(candidate, requirements) {
  const weights = requirements || {};
  const domainWeight = weights.domainWeight ?? 0.35;
  const independenceWeight = weights.independenceWeight ?? 0.35;
  const errorWeight = weights.errorWeight ?? 0.30;

  const score = (candidate.domainCompetence ?? 0) * domainWeight
    + (candidate.epistemicIndependence ?? 0) * independenceWeight
    + (1 - (candidate.errorCorrelation ?? 0)) * errorWeight;

  return { score: Math.round(score * 1000) / 1000, reasons: buildReasons(candidate) };
}

function selectVerifier(ctx) {
  const { candidates, problemDomain, excludeIds } = ctx;
  if (!candidates || candidates.length === 0) return null;

  const excludeSet = new Set(excludeIds || []);
  const eligible = candidates.filter(c => !excludeSet.has(c.agentId));
  if (eligible.length === 0) return null;

  const nonLineage = eligible.filter(c => !isLineageRelation(c.relationType));
  const pool = nonLineage.length > 0 ? nonLineage : [];
  if (pool.length === 0) return null;

  let best = null;
  let bestScore = -1;

  for (const candidate of pool) {
    const result = scoreRelation(candidate, {
      domainWeight: 0.35,
      independenceWeight: 0.35,
      errorWeight: 0.30
    });
    if (result.score > bestScore) {
      bestScore = result.score;
      best = { candidate, score: result.score, reasons: result.reasons };
    }
  }

  return best;
}

function selectPartner(ctx) {
  const { candidates, problemDomain, relationType } = ctx;
  if (!candidates || candidates.length === 0) return null;

  const eligible = candidates.filter(c => c.relationType === relationType);
  if (eligible.length === 0) return null;

  let best = null;
  let bestScore = -1;

  for (const candidate of eligible) {
    const result = scoreRelation(candidate, {
      domainWeight: 0.30,
      independenceWeight: 0.20,
      errorWeight: 0.20
    });
    const totalScore = result.score + 0.3;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      best = { candidate, score: totalScore, reasons: [...result.reasons, `relation match: ${relationType}`] };
    }
  }

  return best;
}

async function getRelationProfile(agentA, agentB) {
  const relations = await listRelations({ agentId: agentA });
  const matches = relations.filter(r =>
    (r.sourceAgentId === agentA && r.targetAgentId === agentB) ||
    (r.sourceAgentId === agentB && r.targetAgentId === agentA)
  );

  if (matches.length === 0) {
    return {
      relationType: 'stranger',
      relationClass: null,
      properties: getExtendedProperties('stranger'),
      direction: 'none'
    };
  }

  let primary = matches[0];
  for (const match of matches) {
    const props = getExtendedProperties(match.relationType);
    const primaryProps = getExtendedProperties(primary.relationType);
    if ((props.familiarity || 0) > (primaryProps.familiarity || 0)) {
      primary = match;
    }
  }

  const properties = getExtendedProperties(primary.relationType);
  const direction = primary.sourceAgentId === agentA ? 'forward' : 'reverse';

  return {
    relationType: primary.relationType,
    relationClass: primary.relationClass,
    properties,
    direction
  };
}

module.exports = {
  EXTENDED_RELATION_TYPES,
  EXTENDED_RELATION_PRESETS,
  selectVerifier,
  selectPartner,
  scoreRelation,
  getRelationProfile,
  isLineageRelation,
  getExtendedProperties
};
