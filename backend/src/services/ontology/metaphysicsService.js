'use strict';

/**
 * Métaphysique Service — monisme matériel, panpsychisme, éliminativisme, propriétés de second ordre.
 *
 * Mapping GenOS :
 *  - Monisme matériel : la matière est la seule substance réelle ; le mental est réductible au physique.
 *  - Panpsychisme : la conscience est un fond universal ; tout le monde possède une forme primitive de conscience.
 *  - Éliminativisme : les états mentaux tels que conceptualisés par la psychologie folk sont des illusions ; ils seront remplacés par une neurosciences mature.
 *  - Propriétés de second ordre : propriétés qui portent sur des propriétés (ex: la modalité d'une propriété, sa puissance, son intentionnalité).
 *
 * Référence :
 *  - Monisme matériel : monopole ontologique de la matière (Démocrite, Hobbes, Armstrong, Lewis).
 *  - Panpsychisme : conscience universelle (Thalès, Plotin, Whitehead, Stéphane, Goff, Galen Strawson).
 *  - Éliminativisme : Churchland, Paul, eliminative materialism.
 *  - Propriétés de second ordre : propriétés strucurelles, propriétés de propriétés.
 */

const { text, object, evidence } = require('./ontologyContracts');

const FRAMEWORKS = Object.freeze(['monism-idealism', 'panpsychism', 'eliminativism', 'physicalism', 'dualism']);

/**
 * materialMonism — évalue une affirmation de monisme matériel.
 *
 * Retourne un verdict conceptuel avec les prémisses, conclusion, et état d'évidence.
 */
function materialMonism(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const premises = Array.isArray(input.premises) ? input.premises : [
    'Toute entité est physiquement constituée.',
    'Aucune entité non physique n\'est nécessaire pour expliquer les phénomènes.',
  ];
  const conclusion = 'Le mental est réductible au physique ; il n\'y a qu\'une seule substance matérielle.';
  return {
    subjectId,
    position: 'material-monism',
    premises,
    conclusion,
    evidence: evidence(input.evidence),
    limitation: 'Cette évaluation formalise la position ; elle ne démontre pas la vérité du monisme.',
  };
}

/**
 * panpsychism — évalue une affirmation panpsychiste.
 *
 * Retourne un verdict conceptuel avec les prémisses, conclusion, et état d'évidence.
 */
function panpsychism(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const premises = Array.isArray(input.premises) ? input.premises : [
    'La conscience est un attribut fondamental de toute entité.',
    'Toute forme de matière possède une forme primitive d\'expérience subjective.',
  ];
  const conclusion = 'Le mental est présent sous une forme élémentaire dans toute la matière.';
  return {
    subjectId,
    position: 'panpsychism',
    premises,
    conclusion,
    evidence: evidence(input.evidence),
    limitation: 'Le panpsychisme conceptualise un fond de conscience universelle ; le runtime ne mesure pas l\'expérience subjective.',
  };
}

/**
 * eliminativism — évalue une affirmation éliminativiste.
 *
 * Retourne un verdict conceptuel avec les prémisses, conclusion, et état d'évidence.
 */
function eliminativism(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const premises = Array.isArray(input.premises) ? input.premises : [
    'Les catégories mentales folk (croyance, désir, sensation) sont des fictions théoriques.',
    'Une science mature du mental nous conduira à éliminer ces catégories au profit de descriptions neurophysiologiques.',
  ];
  const conclusion = 'Les entités mentales folk sont éliminables ; le futur ontology du mental sera physique.';
  return {
    subjectId,
    position: 'eliminativism',
    premises,
    conclusion,
    evidence: evidence(input.evidence),
    limitation: 'L\'éliminativisme prédit une révolution conceptuelle ; le runtime ne valide pas une telle révolution.',
  };
}

/**
 * secondOrderProperty — enregistre une propriété de second ordre (une propriété d'une propriété).
 *
 * Retourne la description de la propriété de second ordre avec sa relation à la propriété de base.
 */
function secondOrderProperty(input = {}) {
  const property = text(input.property, 'property');
  const baseProperty = text(input.baseProperty, 'baseProperty');
  const relation = text(input.relation || 'evaluates', 'relation');
  const modalProfile = object(input.modalProfile || {});
  return {
    property,
    baseProperty,
    relation,
    modalProfile,
    evidence: evidence(input.evidence),
    status: 'descriptive',
  };
}

/**
 * comparePositions — compare matérialisme, panpsychisme, éliminativisme sur un sujet donné.
 *
 * Retourne une synthèse comparative avec état d'évidence.
 */
function comparePositions(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const positions = [materialMonism({ subjectId, evidence: input.evidence }),
    panpsychism({ subjectId, evidence: input.evidence }),
    eliminativism({ subjectId, evidence: input.evidence })];
  return {
    subjectId,
    positions: positions.map(p => ({
      position: p.position,
      conclusion: p.conclusion,
      evidenceStatus: p.evidence.status,
    })),
    comparison: 'Les trois positions s\'accordent sur le primat du physique, mais diffèrent sur le statut du mental.',
    evidence: evidence(input.evidence),
    limitation: 'La comparaison est conceptuelle ; aucune métrique runtime ne tranche entre elles.',
  };
}

/**
 * compareMindMatterModels — API historique.
 */
function compareMindMatterModels(input = {}) {
  const subjectId = text(input.subjectId || input.agentId, 'subjectId');
  const frameworks = Array.isArray(input.frameworks) ? input.frameworks : FRAMEWORKS;
  return { subjectId, frameworks, mappings: frameworks.map(framework => ({ framework, executable: false })),
    evidence: evidence(input.evidence), limitation: 'Aucune métrique runtime ne prouve une expérience subjective.' };
}

/**
 * registerSecondOrderProperty — API historique.
 */
function registerSecondOrderProperty(input = {}) {
  const property = text(input.property, 'property');
  const baseProperty = text(input.baseProperty, 'baseProperty');
  return { property, baseProperty, relation: input.relation || 'evaluates', evidence: evidence(input.evidence), status: 'descriptive' };
}

/**
 * compareEmergenceAndElimination — API historique.
 */
function compareEmergenceAndElimination(input = {}) {
  const phenomenon = text(input.phenomenon, 'phenomenon');
  return { phenomenon, positions: ['emergence', 'eliminativism'], verdict: 'underdetermined', evidenceStatus: 'unverified' };
}

module.exports = {
  FRAMEWORKS,
  materialMonism,
  panpsychism,
  eliminativism,
  secondOrderProperty,
  comparePositions,
  compareMindMatterModels,
  registerSecondOrderProperty,
  compareEmergenceAndElimination,
};
