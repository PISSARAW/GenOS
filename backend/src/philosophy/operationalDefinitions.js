'use strict';

const { C } = require('./definitionFactory');

// ─── Core commitments (principes intestinaux GenOS) ──────────────────────
const CORE_COMMITMENT_DEFINITIONS = [
  C({
    id: 'core.success-not-truth',
    label: 'Le succès de transport n\'est pas la preuve d\'une décision valide',
    domain: 'epistemology',
    school: 'genos',
    status: 'implemented',
    service: 'evidenceGate',
    role: 'core',
    runtimeAuthority: true,
    falsifiable: true,
    scope: 'Un transport réussi n\'établit pas la vérité ou la validité épistémique d\'une décision.',
    knownLimits: [
      'Ce principe est une contrainte interne, pas une loi logique.',
      'Il ne garantit pas la détection de toutes les erreurs.',
    ],
    historicalConfidence: 1,
  }),
  C({
    id: 'core.claim-not-evidence',
    label: 'Une assertion n\'est pas une preuve',
    domain: 'epistemology',
    school: 'genos',
    status: 'implemented',
    service: 'evidenceGate',
    role: 'core',
    runtimeAuthority: true,
    falsifiable: true,
    scope: 'Distinction entre déclaration et preuve empirique.',
    knownLimits: [
      'Le niveau de preuve acceptable est configurable, pas absolu.',
    ],
    historicalConfidence: 1,
  }),
  C({
    id: 'core.intervention-not-metaphor',
    label: 'L\'intervention causale n\'est pas une métaphore',
    domain: 'causality',
    school: 'genos',
    status: 'implemented',
    service: 'causalityService',
    role: 'core',
    runtimeAuthority: true,
    falsifiable: true,
    scope: 'Une intervention causale doit être mesurable, pas seulement rhétorique.',
    knownLimits: [
      'La mesure dépend de l\'instrumentation disponible.',
    ],
    historicalConfidence: 1,
  }),
  C({
    id: 'core.biomimetic-experimental',
    label: 'Le biomimétisme est expérimental, pas décoratif',
    domain: 'ontology',
    school: 'genos',
    status: 'implemented',
    service: 'ontologyCore',
    role: 'core',
    runtimeAuthority: true,
    falsifiable: true,
    scope: 'Chaque mécanisme biomimétrique doit être une hypothèse testable.',
    knownLimits: [
      'Le cadre expérimental est limité par l\'instrumentation GenOS.',
    ],
    historicalConfidence: 1,
  }),
];

// ─── Biomimetic analogies ─────────────────────────────────────────────────
const BIOMIMETIC_DEFINITIONS = [
  C({
    id: 'biomimetic.chemotaxis',
    label: 'Chémotaxie : attraction/répulsion par gradient',
    domain: 'ontology',
    school: 'biomimetics',
    status: 'implemented',
    role: 'analogy',
    falsifiable: false,
    scope: 'Analogie pour l\'exploration dirigée par gradient dans les missions.',
    knownLimits: [
      'Le gradient est une métrique, pas un signal biologique.',
    ],
    historicalConfidence: 0.9,
  }),
  C({
    id: 'biomimetic.affinity-maturation',
    label: 'Maturation d\'affinité : amélioration itérative de la spécificité',
    domain: 'ontology',
    school: 'biomimetics',
    status: 'partial',
    role: 'analogy',
    falsifiable: false,
    scope: 'Modèle pour l\'affinement progressif des solutions par sélection.',
    knownLimits: [
      'La sélection est algorithmique, pas immunologique.',
    ],
    historicalConfidence: 0.85,
  }),
  C({
    id: 'biomimetic.stress-mutagenesis',
    label: 'Mutagenèse sous stress : variation forcée par la contrainte',
    domain: 'ontology',
    school: 'biomimetics',
    status: 'partial',
    role: 'analogy',
    falsifiable: false,
    scope: 'Principe de diversification face à l\'échec.',
    knownLimits: [
      'La mutation est déterministe, pas aléatoire.',
    ],
    historicalConfidence: 0.85,
  }),
  C({
    id: 'biomimetic.phenotypic-plasticity',
    label: 'Plasticité phénotypique : adaptation sans changement de génome',
    domain: 'ontology',
    school: 'biomimetics',
    status: 'partial',
    role: 'analogy',
    falsifiable: false,
    scope: 'Capacité à changer de comportement sans modifier la spécification.',
    knownLimits: [
      'La plasticité est bornée par le génome.',
    ],
    historicalConfidence: 0.9,
  }),
  C({
    id: 'biomimetic.cultural-transmission',
    label: 'Transmission culturelle : héritage de patterns appris',
    domain: 'ontology',
    school: 'biomimetics',
    status: 'planned',
    role: 'analogy',
    falsifiable: false,
    scope: 'Transfert de comportements entre générations d\'agents.',
    knownLimits: [
      'Pas de mécanisme d\'apprentissage social implémenté.',
    ],
    historicalConfidence: 0.8,
  }),
  C({
    id: 'biomimetic.exaptation',
    label: 'Exaptation : réaffectation fonctionnelle',
    domain: 'ontology',
    school: 'biomimetics',
    status: 'planned',
    role: 'analogy',
    falsifiable: false,
    scope: 'Une structure acquise pour un usage peut servir à un autre.',
    knownLimits: [
      'La réaffectation est contrôlée, pas fortuite.',
    ],
    historicalConfidence: 0.85,
  }),
];

// ─── Interpretive lenses ─────────────────────────────────────────────────
const LENS_DEFINITIONS = [
  C({
    id: 'lens.stoicism',
    label: 'Stoïcisme : logos, acceptation, vertu',
    domain: 'schools',
    school: 'stoicism',
    status: 'implemented',
    service: 'stoicismService',
    role: 'lens',
    falsifiable: false,
    scope: 'Lentille d\'analyse pour l\'acceptation et la distinction contrôlable/contrôlable.',
    knownLimits: [
      'L\'implémentation ne capture pas la dimension cosmique du logos.',
    ],
    historicalConfidence: 0.9,
  }),
  C({
    id: 'lens.epicureanism',
    label: 'Épicurisme : ataraxie, plaisir mesuré',
    domain: 'schools',
    school: 'epicurus',
    status: 'implemented',
    service: 'epicureanService',
    role: 'lens',
    falsifiable: false,
    scope: 'Lentille pour l\'évaluation des actions par leur contribution à la stabilité.',
    knownLimits: [
      'Le plaisir est une métrique opérationnelle, pas une sensation.',
    ],
    historicalConfidence: 0.9,
  }),
  C({
    id: 'lens.whitehead',
    label: 'Whitehead : process, actual occasions',
    domain: 'process',
    school: 'whitehead',
    status: 'partial',
    role: 'lens',
    falsifiable: false,
    scope: 'Lentille pour penser les événements comme primitives, pas les substances.',
    knownLimits: [
      'Les actual occasions sont des événements de journalisation, pas des primitives ontologiques.',
    ],
    historicalConfidence: 0.85,
  }),
  C({
    id: 'lens.deleuze',
    label: 'Deleuze : différance, rhizome, multiplicité',
    domain: 'process',
    school: 'deleuze',
    status: 'partial',
    role: 'lens',
    falsifiable: false,
    scope: 'Lentille pour les structures non-hiérarchiques et la différenciation.',
    knownLimits: [
      'La topologie rhizomatique est métaphorique, pas computationnelle.',
    ],
    historicalConfidence: 0.85,
  }),
  C({
    id: 'lens.utilitarianism',
    label: 'Utilitarisme : maximisation du bien-être',
    domain: 'normative-ethics',
    school: 'mill-bentham',
    status: 'implemented',
    service: 'environmentalEthicsService',
    role: 'lens',
    falsifiable: false,
    scope: 'Lentille pour évaluer les actions par leurs conséquences agrégées.',
    knownLimits: [
      'L\'utilité est déclarative, pas mesurée.',
      'L\'horizon et la distribution sont ignorés par le mapping actuel.',
    ],
    historicalConfidence: 0.9,
  }),
  C({
    id: 'lens.virtue-ethics',
    label: 'Éthique des vertus : caractère, eudaimonia',
    domain: 'normative-ethics',
    school: 'aristotle',
    status: 'implemented',
    service: null,
    role: 'lens',
    falsifiable: false,
    scope: 'Lentille pour évaluer l\'agent par son caractère déclaré.',
    knownLimits: [
      'La moyenne de scores de vertus n\'est pas une mesure valide de l\'eudaimonia.',
    ],
    historicalConfidence: 0.9,
  }),
];

// ─── Epistemology extensions ─────────────────────────────────────────────
const EPISTEMOLOGY_EXTENSIONS = [
  C({
    id: 'epistemology.falsification',
    label: 'Falsificationnisme : une théorie doit être réfutable',
    domain: 'epistemology',
    school: 'popper',
    status: 'implemented',
    service: null,
    role: 'operational',
    falsifiable: true,
    scope: 'Critère de démarcation : une hypothèse scientifique doit exposer des conditions de réfutation.',
    knownLimits: [
      'Le critère est logique, pas sociologique.',
      'La réfutation dépend de l\'instrumentation.',
    ],
    historicalConfidence: 0.9,
  }),
  C({
    id: 'epistemology.revisability',
    label: 'Révisabilité : toute connaissance est provisoire',
    domain: 'epistemology',
    school: 'popper',
    status: 'implemented',
    service: null,
    role: 'operational',
    falsifiable: true,
    scope: 'Principe qu\'aucune théorie n\'est définitive.',
    knownLimits: [
      'La révisabilité ne signifie pas que toutes les théories sont fausses.',
    ],
    historicalConfidence: 0.85,
  }),
  C({
    id: 'epistemology.evidence-algebra',
    label: 'Algèbre d\'évidence : combinaison structurée de preuves',
    domain: 'epistemology',
    school: 'genos',
    status: 'partial',
    service: 'typedEvidenceAlgebraService',
    role: 'operational',
    falsifiable: true,
    scope: 'Combinaison et évaluation de preuves avec traçabilité.',
    knownLimits: [
      'Les preuves sont déclaratives, pas empiriques.',
    ],
    historicalConfidence: 0.8,
  }),
];

// ─── Method extensions ───────────────────────────────────────────────────
const METHOD_EXTENSIONS = [
  C({
    id: 'method.intervention-replay',
    label: 'Rejeu d\'intervention : rejouer pour vérifier la causalité',
    domain: 'methods',
    school: 'genos',
    status: 'partial',
    service: 'proceduralCausalValidationService',
    role: 'operational',
    falsifiable: true,
    scope: 'Technique pour vérifier qu\'un changement produit un effet causal.',
    knownLimits: [
      'Le rejeu est une approximation, pas une expérience contrôlée.',
    ],
    historicalConfidence: 0.85,
  }),
];

module.exports = {
  CORE_COMMITMENT_DEFINITIONS,
  BIOMIMETIC_DEFINITIONS,
  LENS_DEFINITIONS,
  EPISTEMOLOGY_EXTENSIONS,
  METHOD_EXTENSIONS,
};
