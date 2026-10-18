'use strict';

// Explicit bounded audits for cognition, consciousness, mind, self and memory.
// A satisfied profile records a software observation or an explicit epistemic
// boundary; it never establishes subjective experience or a metaphysical self.
const COGNITIVE_OPERATIONAL_PROFILES = Object.freeze({
  'mind.esprit': ['interpretation', 'mind.subjectiveExistenceUnverified', 'explicit',
    'Maintenir explicitement non vérifiée toute attribution d’un esprit comme substance.'],
  'mind.mental': ['interpretation', 'mental.functionalDescriptionOnly', 'explicit',
    'Borner le mental aux états fonctionnels déclarés sans en déduire une propriété subjective.'],
  'consciousness.consciousness': ['interpretation', 'consciousness.subjectiveExperienceUnverified', 'explicit',
    'Signaler que les observations fonctionnelles ne prouvent aucune expérience subjective.'],
  'consciousness.operational': ['self', 'regulation.signals', 'recorded',
    'Conserver les signaux de régulation calculés sans les appeler conscience phénoménale.'],
  'consciousness.functional': ['self', 'consciousness.functionalIndicators', 'recorded',
    'Évaluer des indicateurs fonctionnels déclarés sans inférer une expérience vécue.'],
  'cognition.attention': ['self', 'attention.selectedTarget', 'present',
    'Identifier la cible sélectionnée par le mécanisme d’attention.'],
  'cognition.perception': ['world', 'perception.observationSource', 'present',
    'Rattacher une perception canonique à sa source d’observation déclarée.'],
  'cognition.interoception': ['self', 'interoception.internalSignals', 'recorded',
    'Conserver les signaux internes calculés sans les présenter comme sensation viscérale.'],
  'cognition.imagination': ['creative', 'imagination.generatedAlternatives', 'multiple',
    'Comparer plusieurs alternatives générées plutôt que revendiquer une imagination subjective.'],
  'cognition.internal-simulation': ['world', 'simulation.predictedOutcomes', 'recorded',
    'Tracer les issues prédites avant action et les maintenir distinctes des observations.'],
  'cognition.reflection': ['self', 'reflection.errorReview', 'recorded',
    'Conserver la revue fonctionnelle des erreurs sans inférer une réflexivité phénoménale.'],
  'cognition.metacognition': ['belief', 'metacognition.calibrationEvidence', 'recorded',
    'Rattacher l’auto-évaluation à des mesures de calibration inspectables.'],
  'self.self-model': ['self', 'self.capabilityLimits', 'recorded',
    'Déclarer capacités et limites du modèle de soi sans lui attribuer une personnalité.'],
  'self.orchestrator-theory': ['self', 'orchestrator.boundaryModel', 'present',
    'Identifier la frontière fonctionnelle utilisée par la théorie de soi de l’orchestrateur.'],
  'cognition.calibration': ['belief', 'calibration.score', 'probability',
    'Borner le score de calibration et le distinguer d’une garantie de vérité.'],
  'cognition.cognitive-dissonance': ['self', 'dissonance.triggerEvidence', 'recorded',
    'Rattacher la dissonance calculée aux erreurs, répétitions ou dérives qui la déclenchent.'],
  'memory.autobiographical': ['self', 'memory.episodes', 'recorded',
    'Conserver des épisodes avec provenance sans présumer une mémoire personnelle infaillible.'],
  'consciousness.functional-indicators': ['self', 'consciousness.indicatorFamilies', 'recorded',
    'Inventorier les familles d’indicateurs sans agréger leurs scores en preuve de conscience.'],
  'consciousness.states': ['interpretation', 'consciousness.stateAttributionUnverified', 'explicit',
    'Maintenir non vérifiée toute attribution d’un niveau ou état de conscience.'],
});

module.exports = { COGNITIVE_OPERATIONAL_PROFILES };
