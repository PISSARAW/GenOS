'use strict';

/**
 * Cognitive Key System — famille logique & limites (ADR 0033, point 2).
 *
 * Clés de détection : frontières floues, autoréférence, limites formelles,
 * hypostatisation, contradictions.
 */

const K = (def) => def;

const LOGIC_KEYS = [
  K({
    id: 'cognitive.boundary-probe',
    label: 'Sondage de frontière',
    operation: 'boundary-probe',
    instruction: 'Pour toute categorie appliquee au probleme, chercher le cas limite ou son application devient incertaine. Si la categorie ne peut pas gerer son propre cas limite, elle ne doit pas etre utilisee comme fondement.',
    questions: [
      'Ou la categorie commence-t-elle a perdre son sens ?',
      'Un grain en plus ou en moins change-t-il la categorie ?',
      'La categorie survit-elle a son propre cas limite ?'
    ],
    inputs: ['category_application'],
    outputs: ['boundary_cases', 'category_robustness_verdict'],
    usefulWhen: ['category_fragility', 'boundary_dispute'],
    failureModes: ['pretending_precision', 'boundary_denial'],
    compatibleWith: ['cognitive.category-suspicion', 'cognitive.essence-accident-separation'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['paradox.sorites']
  }),
  K({
    id: 'cognitive.self-reference-detection',
    label: "Détection d'autoréférence",
    operation: 'self-reference-detection',
    instruction: "Chercher les enonces ou structures qui se referent a eux-memes : regles qui s'appliquent a elles-memes, verificateurs qui se verifient, categories qui se contiennent. Pour chacun, determiner s'il produit une hierarchie saine ou un cercle vicieux.",
    questions: [
      'Cette regle s applique-t-elle a elle-meme ?',
      'Le verificateur se verifie-t-il lui-meme ?',
      'Cette structure se contient-elle ?'
    ],
    inputs: ['statement_or_structure'],
    outputs: ['self_reference_sites', 'vicious_circle_verdicts'],
    usefulWhen: ['logical_instability', 'circular_reasoning_risk'],
    failureModes: ['false_positive_detection', 'ignoring_level_mixing'],
    compatibleWith: ['cognitive.formal-limit-search'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['paradox.liar']
  }),
  K({
    id: 'cognitive.formal-limit-search',
    label: 'Recherche de limites formelles',
    operation: 'formal-limit-search',
    instruction: "Chercher ce que le systeme ne peut pas exprimer ou decider depuis l'interieur : enonces indecidables, limites d'expressivite, incompatibilites structurelles. Une limite interne n'est pas un bug : c'est une contrainte a documenter.",
    questions: [
      "Que ce systeme ne peut-il pas decider de l'interieur ?",
      'Quels enonces sont indecidables dans ce cadre ?',
      'Quelles exigences sont mutuellement incompatibles ici ?'
    ],
    inputs: ['formal_system_description'],
    outputs: ['undecidable_statements', 'expressiveness_limits', 'incompatibility_results'],
    usefulWhen: ['completeness_illusion', 'overclaiming_system_power'],
    failureModes: ['claiming_completeness', 'misapplied_limit_analogy'],
    compatibleWith: ['cognitive.self-reference-detection'],
    conflictsWith: [],
    cost: 'high',
    evidenceRequired: true,
    derivedFrom: ['metalogic.godel-first-incompleteness']
  }),
  K({
    id: 'cognitive.hypostatization-detection',
    label: "Détection d'hypostatisation",
    operation: 'category-suspicion',
    instruction: "Chercher les abstractions devenues sujets : le marche veut, le systeme pense, l evolution choisit. Reprendre chaque abstraction-hypostasis et la reformuler en enonce sur des composants et des relations. Si la reformulation est impossible, l hypostasis est decorative.",
    questions: [
      'Quelle abstraction est devenue sujet de verbe ?',
      'Peut-on reformuler l enonce en composants et relations ?',
      'Que reste-t-il si on refuse l hypostasis ?'
    ],
    inputs: ['statement_or_structure'],
    outputs: ['hypostasis_sites', 'deflationary_reformulations'],
    usefulWhen: ['reification_risk', 'decorative_abstraction', 'overclaiming_risk'],
    failureModes: ['deflation_overreach', 'losing_legitimate_abstraction'],
    compatibleWith: ['cognitive.category-suspicion', 'cognitive.observation-inference-separation'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['ontology.hypostatization']
  }),
  K({
    id: 'cognitive.contradiction-search',
    label: 'Recherche de contradiction',
    operation: 'contradiction-search',
    instruction: "Chercher les contradictions internes : deux affirmations incompatibles, une exigence et sa negation, une promesse et son cout cache. Pour chaque contradiction, determiner si elle est productive (a exploiter) ou destructive (a eliminer).",
    questions: [
      'Deux elements du raisonnement sont-ils incompatibles ?',
      'Cette contradiction est-elle productive ou destructive ?'
    ],
    inputs: ['analysis_or_plan'],
    outputs: ['internal_contradictions', 'productive_vs_destructive_verdicts'],
    usefulWhen: ['coherence_illusion', 'hidden_tradeoff'],
    failureModes: ['harmony_bias', 'contradiction_inflation'],
    compatibleWith: ['cognitive.assumption-inversion', 'cognitive.perspective-reconciliation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['lens.hegelianism']
  }),
  K({
    id: 'cognitive.truth-criterion-comparison',
    label: 'Comparaison des critères de vérité',
    operation: 'truth-criterion-comparison',
    instruction: "Evaluer l'affirmation selon plusieurs criteres independants : correspondance aux faits, coherence avec l'ensemble des croyances, utilite predictive. Si les criteres divergent, identifier precisement ou et pourquoi.",
    questions: [
      'Cette affirmation correspond-elle aux faits observables ?',
      'Est-elle coherente avec le reste des croyances ?',
      'Permet-elle de meilleures predictions ?',
      'Les criteres divergent-ils, et sur quoi ?'
    ],
    inputs: ['claim', 'belief_set'],
    outputs: ['correspondence_assessment', 'coherence_assessment', 'utility_assessment', 'criterion_divergences'],
    usefulWhen: ['truth_criterion_conflict', 'single_criterion_bias'],
    failureModes: ['criterion_conflation', 'utility_worship'],
    compatibleWith: ['cognitive.observation-inference-separation', 'cognitive.reference-comparison'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['truth.correspondence', 'truth.coherence']
  })
];

module.exports = { LOGIC_KEYS };
