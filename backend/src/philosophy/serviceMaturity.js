'use strict';

const MATURITY_LEVELS = Object.freeze(['implemented', 'partial', 'conceptual', 'planned']);

const SERVICE_MATURITY = Object.freeze({
  propositionalLogicService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Sémantique propositionnelle classique bornée par tables de vérité.' },
  modalLogicService: { level: 'partial', executable: true, evidence: 'tests', note: 'Évaluation bornée sur cadres de Kripke.' },
  deonticDynamicLogicService: { level: 'partial', executable: true, evidence: 'tests', note: 'Analyse descriptive des devoirs et annonces publiques.' },
  nonClassicalLogicService: { level: 'partial', executable: true, evidence: 'tests', note: 'Valeurs de vérité bornées ; aucune promotion automatique.' },
  metalogicService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Analyse bornée de méta-langage ; aucune preuve générale n’est inférée.' },
  paradoxAnalysisService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Comparaison bornée de solutions aux paradoxes.' },
  ontologyCore: { level: 'implemented', executable: true, evidence: 'tests', note: 'Être, substance et identité runtime.' },
  ontologyAttributes: { level: 'implemented', executable: true, evidence: 'tests', note: 'Attributs et historique des changements.' },
  ontologyModes: { level: 'implemented', executable: true, evidence: 'tests', note: 'Modes et transitions d’exécution.' },
  ontologyIdentity: { level: 'partial', executable: true, evidence: 'tests', note: 'Continuité runtime, sans théorie complète du soi.' },
  personOtherService: { level: 'partial', executable: true, evidence: 'tests', note: 'Relations d’altérité bornées, sans inférence d’autorité.' },
  continuityService: { level: 'partial', executable: true, evidence: 'tests', note: 'Mesures continues et classifications discrètes traçables.' },
  possibleWorldService: { level: 'partial', executable: true, evidence: 'tests', note: 'Mondes hypothétiques comparables, sans preuve automatique.' },
  speculativeRealismService: { level: 'partial', executable: true, evidence: 'tests', note: 'Limites de corrélation et modes d’accès, sans verdict métaphysique.' },
  metaphysicsService: { level: 'partial', executable: true, evidence: 'tests', note: 'Comparaison bornée des modèles esprit-matière.' },
  consciousnessService: { level: 'partial', executable: true, evidence: 'tests', note: 'Structures de qualia et d’intentionnalité simulées.' },
  propertyService: { level: 'partial', executable: true, evidence: 'tests', note: 'Propriétés, supervenience et émergence opérationnelles.' },
  phenomenologyService: { level: 'partial', executable: true, evidence: 'tests', note: 'Mappings phénoménologiques, sans accès à la première personne.' },
  causalityService: { level: 'partial', executable: true, evidence: 'tests', note: 'Relations causales et contrefactuelles opérationnelles.' },
  identityService: { level: 'partial', executable: true, evidence: 'tests', note: 'Continuité et critères d’identité calculables.' },
  mindModelsService: { level: 'conceptual', executable: false, evidence: 'documentation', note: 'Comparaison de positions, sans théorie unifiée.' },
  cognitionService: { level: 'planned', executable: false, evidence: 'none', note: 'Cognition sociale et représentations à spécifier.' },
  consciousnessMetricsService: { level: 'conceptual', executable: false, evidence: 'none', note: 'Les métriques ne constituent pas une preuve de conscience.' },
  aestheticsService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Évaluations esthétiques bornées, interprétatives et fondées sur des observations fournies.' },
  artTheoryService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Comparaison de théories de l’art à partir de critères déclarés, sans verdict ontologique.' },
  interpretationService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Lectures révisables, attribution prudente de l’intention et pluralité interprétative.' }
  ,playNarrativeService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Analyse descriptive du jeu, de la fiction et de la narration, sans confusion entre fiction et vérité factuelle.' },
  cinemaMusicService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Analyse cinématographique et musicale fondée sur des caractéristiques fournies.' },
  visualCultureService: { level: 'implemented', executable: true, evidence: 'tests', note: 'Analyse descriptive de l’architecture, du design, des médias numériques et des affinités stylistiques.' }
});

function maturityForService(service) {
  if (!service) return null;
  return SERVICE_MATURITY[service] || {
    level: 'conceptual',
    executable: false,
    evidence: 'none',
    note: 'Service non référencé dans le catalogue de maturité.'
  };
}

function maturityForConcept(concept) {
  const explicit = concept.serviceMaturity;
  const profile = explicit || maturityForService(concept.service);
  if (profile) return { service: concept.service || null, ...profile };
  return {
    service: null,
    level: concept.status === 'planned' ? 'planned' : 'conceptual',
    executable: false,
    evidence: 'none',
    note: 'Aucun service exécutable associé.'
  };
}

module.exports = {
  MATURITY_LEVELS,
  SERVICE_MATURITY,
  maturityForService,
  maturityForConcept
};
