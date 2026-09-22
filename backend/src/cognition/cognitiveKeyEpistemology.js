'use strict';

/**
 * Cognitive Key System — famille épistémologie & causalité (ADR 0033, point 2).
 *
 * Clés d'extraction des observations, d'hypothèses et de causes.
 * Règle d'indépendance doctrinale : aucune instruction ne mentionne
 * philosophe, école ou mouvement d'origine.
 */

const K = (def) => def;

const EPISTEMOLOGY_KEYS = [
  K({
    id: 'cognitive.observation-inference-separation',
    label: 'Séparation observé / inféré / imposé',
    operation: 'observation-inference-separation',
    instruction: "Separer trois couches : ce qui est directement observe, ce qui est infere, ce qui vient du cadre de representation lui-meme. Puis identifier quelles conclusions disparaitraient si le cadre changeait.",
    questions: [
      'Quelle partie de cette affirmation est une mesure, une inference, une convention du cadre ?',
      'Quelle conclusion survit au changement de cadre ?'
    ],
    inputs: ['claim'],
    outputs: ['observed_layer', 'inferred_layer', 'framework_layer', 'frame_dependent_conclusions'],
    usefulWhen: ['observational_uncertainty', 'framework_suspicion', 'overclaiming_risk'],
    failureModes: ['treating_inference_as_observation', 'framework_blindness'],
    compatibleWith: ['cognitive.falsification-search', 'cognitive.frame-analysis'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: true,
    derivedFrom: ['lens.kantianism']
  }),
  K({
    id: 'cognitive.falsification-search',
    label: 'Recherche du test qui fait tomber',
    operation: 'falsification-search',
    instruction: "Pour l'hypothese courante, construire le test le plus susceptible de la refuter, le plus petit test qui discrimine, et l'observation la plus improbable si elle est vraie. Ne pas chercher de confirmation.",
    questions: [
      'Quelle observation rendrait cette hypothese intenable ?',
      'Quel est le plus petit test discriminant ?',
      'Quelle prediction audacieuse cette hypothese ose-t-elle ?'
    ],
    inputs: ['hypothesis'],
    outputs: ['refutation_tests', 'discriminating_test', 'risky_prediction'],
    usefulWhen: ['confirmation_bias_risk', 'hypothesis_lock_in', 'weak_evidence'],
    failureModes: ['post_hoc_immunization', 'unfalsifiable_reformulation', 'testing_trivia'],
    compatibleWith: ['cognitive.counterfactual-variation', 'cognitive.regularity-cause-separation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['epistemology.falsification', 'science.falsification-demarcation']
  }),
  K({
    id: 'cognitive.regularity-cause-separation',
    label: 'Séparation régularité / cause',
    operation: 'regularity-cause-separation',
    instruction: 'Lister les regularites observees (A suit B), puis pour chacune etablir si la conjonction constante suffit a affirmer la causalite. Traiter toute regularite non-intervenue comme une hypothese causale, pas une cause.',
    questions: [
      'Cette correlation survit-elle a une intervention ?',
      'Quelle troisieme variable produirait la meme regularite ?'
    ],
    inputs: ['observed_regularities'],
    outputs: ['regularity_inventory', 'causal_hypotheses', 'confounder_candidates'],
    usefulWhen: ['causal_uncertainty', 'correlation_inflation'],
    failureModes: ['correlation_as_cause', 'ignoring_common_cause'],
    compatibleWith: ['cognitive.counterfactual-variation', 'cognitive.causal-intervention'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['causality.hume-regularity']
  }),
  K({
    id: 'cognitive.counterfactual-variation',
    label: 'Variation contrefactuelle',
    operation: 'counterfactual-variation',
    instruction: "Construire le monde alternatif le plus proche dans lequel la cause candidate est absente, puis determiner quelles consequences surviennent encore. Une consequence qui survit a l'ablation n'est pas causee par elle.",
    questions: [
      'Dans le monde le plus proche sans X, quobserve-t-on ?',
      'Quelle consequence survit a lablation de X ?'
    ],
    inputs: ['hypothesis', 'candidate_cause'],
    outputs: ['control_world', 'intervention_world', 'surviving_outcomes', 'necessity_verdict'],
    usefulWhen: ['causal_uncertainty', 'debugging', 'scientific_explanation'],
    failureModes: ['distant_world_fallacy', 'overwriting_context', 'necessity_sufficiency_confusion'],
    compatibleWith: ['cognitive.causal-intervention', 'cognitive.falsification-search'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['causality.counterfactual-dependence']
  }),
  K({
    id: 'cognitive.causal-intervention',
    label: 'Intervention causale',
    operation: 'causal-intervention',
    instruction: "Pour chaque cause candidate, specifier l'intervention minimale qui la fixe a une valeur, en predire le resultat AVANT d'agir. Ne jamais conclure par observation seule : la preuve causale exige une intervention avec prediction prealable.",
    questions: [
      'Quelle est la plus petite intervention qui fixe X ?',
      'Quelle prediction engage-t-on avant dagir ?'
    ],
    inputs: ['candidate_cause', 'target_outcome'],
    outputs: ['minimal_interventions', 'pre_action_predictions'],
    usefulWhen: ['causal_uncertainty', 'debugging'],
    failureModes: ['observational_inference_only', 'intervening_on_symptom'],
    compatibleWith: ['cognitive.counterfactual-variation', 'cognitive.regularity-cause-separation'],
    conflictsWith: [],
    cost: 'high',
    evidenceRequired: true,
    derivedFrom: ['method.intervention-replay']
  }),
  K({
    id: 'cognitive.accidental-success-detection',
    label: 'Détection de la réussite accidentelle',
    operation: 'accidental-success-detection',
    instruction: "Pour chaque croyance justifiee qui s'est averee vraie, verifier si le lien justification vers verite est causal ou accidentel : la meme justification sur un cas voisin produirait-elle une conclusion fausse ?",
    questions: [
      'La justification portait-elle sur ce qui a rendu la conclusion vraie ?',
      'Le cas voisin le plus proche donne-t-il une reponse fausse avec la meme methode ?'
    ],
    inputs: ['justified_true_belief'],
    outputs: ['causal_link_assessment', 'nearby_failure_cases'],
    usefulWhen: ['success_attribution_risk', 'survivorship_bias'],
    failureModes: ['outcome_worship', 'ignoring_nearby_failures'],
    compatibleWith: ['cognitive.regularity-cause-separation', 'cognitive.falsification-search'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['epistemology.gettier-problem']
  }),
  K({
    id: 'cognitive.paradigm-assumption-search',
    label: 'Recherche des hypothèses du paradigme',
    operation: 'paradigm-assumption-search',
    instruction: "Identifier les hypotheses que le cadre courant ne formule jamais parce qu'elles vont de soi : unites de mesure, metriques de succes, decoupages du probleme. Puis les rendre explicites et tester le probleme dans un cadre ou elles sont inversees.",
    questions: [
      'Quelle question ce cadre ne peut-il pas poser ?',
      'Quelle metrique tient lieu de but sans avoir ete choisie ?',
      "Que devient le probleme si l'unite d'analyse change ?"
    ],
    inputs: ['problem_representation'],
    outputs: ['implicit_assumptions', 'unaskable_questions', 'inverted_frame_variant'],
    usefulWhen: ['representation_lock_in', 'stagnation', 'premature_convergence'],
    failureModes: ['assumption_blindness', 'inverting_trivia'],
    compatibleWith: ['cognitive.representation-shift', 'cognitive.frame-analysis'],
    conflictsWith: [],
    cost: 'high',
    evidenceRequired: false,
    derivedFrom: ['science.paradigm-change']
  })
];

module.exports = { EPISTEMOLOGY_KEYS };
