'use strict';

/**
 * Cognitive Key System — catalogue seed v1 (ADR 0033, point 1).
 *
 * Une CognitiveKey est une opération mentale extraite d'un concept
 * philosophique : ni une identité, ni une croyance. L'agent consomme
 * l'instruction opérationnelle ; la provenance doctrinale vit dans
 * `derivedFrom` et n'est jamais injectée dans les prompts.
 *
 * Règle d'indépendance doctrinale : chaque `instruction` doit être
 * utilisable sans mentionner le philosophe, l'école ou le mouvement
 * d'origine (vérifiée par cognitiveKeyRegistry.js).
 *
 * Ce catalogue est un SEED volontairement restreint (12 clés) : une
 * à deux par famille pour valider chaque clause du contrat. L'extraction
 * complète (20-30 clés, domaines art/jeu/cinéma inclus) est le point 2
 * du plan et ne doit intervenir qu'après validation du contrat.
 */

const K = (def) => def;

const COGNITIVE_KEYS = [
  // ── Épistémologie ──────────────────────────────────────────────
  K({
    id: 'cognitive.observation-inference-separation',
    label: 'Séparation observé / inféré / imposé',
    operation: 'observation-inference-separation',
    instruction: 'Separer trois couches : ce qui est directement observe, ce qui est infere, ce qui vient du cadre de representation lui-meme. Puis identifier quelles conclusions disparaitraient si le cadre changeait.',
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
    derivedFrom: ['school.kantianism']
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
    derivedFrom: ['school.falsificationism', 'science.falsification-demarcation']
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
    compatibleWith: ['cognitive.counterfactual-variation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['causality.hume-regularity']
  }),

  // ── Causalité ──────────────────────────────────────────────────
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
    compatibleWith: ['cognitive.falsification-search'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['causality.counterfactuals']
  }),

  // ── Structure ──────────────────────────────────────────────────
  K({
    id: 'cognitive.structural-abstraction',
    label: 'Abstraction structurelle (relations sur objets)',
    operation: 'structural-abstraction',
    instruction: "Retirer temporairement l'identite des objets et ne conserver que les relations. Chercher les invariants structurels de la configuration de relations, puis identifier quelles proprietes globales emergent de la seule topologie.",
    questions: [
      'Que reste-t-il si les identites des objets sont effacees ?',
      'Quelles relations sont invariantes ?',
      'Quelle propriete globale emerge de la seule topologie ?'
    ],
    inputs: ['concrete_system'],
    outputs: ['relational_structure', 'structural_invariants', 'emergent_properties'],
    usefulWhen: ['complexity', 'representation_lock_in', 'object_bias'],
    failureModes: ['loss_of_material_constraints', 'over_abstraction'],
    compatibleWith: ['cognitive.counterfactual-variation'],
    conflictsWith: ['cognitive.category-suspicion'],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['mathematics.structuralism']
  }),
  K({
    id: 'cognitive.category-suspicion',
    label: 'Suspicion catégorielle',
    operation: 'category-suspicion',
    instruction: "Pour chaque categorie utilisee, verifier si elle est prise pour une chose reelle alors qu'elle n'est qu'un nom commode. Chercher si deux membres de la categorie partagent reellement quelque chose au-dela du nom.",
    questions: [
      'Cette categorie est-elle une chose ou un nom ?',
      'Que partagent reellement ses membres, au-dela du nom ?'
    ],
    inputs: ['category_application'],
    outputs: ['real_vs_nominal_categories', 'membership_overlap_analysis'],
    usefulWhen: ['category_reification', 'false_generality'],
    failureModes: ['nihilistic_dissolution', 'category_elimination_overreach'],
    compatibleWith: ['cognitive.boundary-probe'],
    conflictsWith: ['cognitive.structural-abstraction'],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['mathematics.nominalism']
  }),

  // ── Représentation ─────────────────────────────────────────────
  K({
    id: 'cognitive.frame-analysis',
    label: 'Analyse du cadrage',
    operation: 'frame-analysis',
    instruction: "Delimiter explicitement ce qui est dans le cadre et ce qui est hors cadre. Puis deplacer le cadre : elargir jusqu'a ce que l'element exclu devienne visible, restreindre jusqu'a ce que l'essentiel soit isole. Verifier si l'interpretation depend du cadrage.",
    questions: [
      'Qu est-ce qui est volontairement hors cadre ?',
      'Que revele un cadrage elargi ?',
      'L interpretation depend-elle du cadrage ?'
    ],
    inputs: ['problem_representation'],
    outputs: ['in_frame_elements', 'out_of_frame_elements', 'frame_variants'],
    usefulWhen: ['frame_blindness', 'boundary_arbitrariness'],
    failureModes: ['frame_naturalization', 'infinite_reframing'],
    compatibleWith: ['cognitive.assumption-inversion'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['cinema.film-narration', 'cinema.cognitive-theory']
  }),

  // ── Logique / limites ──────────────────────────────────────────
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
    compatibleWith: ['cognitive.category-suspicion'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['paradox.sorites']
  }),

  // ── Jeu / variation ────────────────────────────────────────────
  K({
    id: 'cognitive.experimental-isolation',
    label: 'Isolation expérimentale',
    operation: 'experimental-isolation',
    instruction: "Delimiter un espace temporaire ou les regles normales sont suspendues et ou l'echec n'a pas de cout. Explorer dans cet espace, puis decider explicitement ce qui en sort et sous quelle validation.",
    questions: [
      'Ou peut-on echouer sans cout ?',
      'Quelles regles peut-on suspendre temporairement ?',
      'Qu est-ce qui sort de l espace, sous quelle validation ?'
    ],
    inputs: ['exploration_target'],
    outputs: ['sandbox_boundary', 'suspended_rules', 'exit_validation_contract'],
    usefulWhen: ['exploration_inhibition', 'risk_aversion', 'sandbox_escape_risk'],
    failureModes: ['sandbox_leakage', 'infinite_sandbox'],
    compatibleWith: ['cognitive.falsification-search'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['play.magic-circle']
  }),

  // ── Éthique / perspectives ─────────────────────────────────────
  K({
    id: 'cognitive.least-favored-position',
    label: 'Position la moins favorisée',
    operation: 'least-favored-position',
    instruction: "Evaluer la solution depuis la position la moins favorisee : l'agent qui recoit le moins d'information, le composant le plus expose aux pires consequences, l'utilisateur sans privileges. Si elle est acceptable de la, elle est robuste.",
    questions: [
      'Qui recoit le moins dans cette solution ?',
      'La solution est-elle acceptable depuis la pire position ?',
      'Que voit-on depuis la position la moins informee ?'
    ],
    inputs: ['candidate_solution'],
    outputs: ['worst_position_analysis', 'hidden_burden_bearers'],
    usefulWhen: ['fairness_blindspot', 'power_asymmetry_ignored'],
    failureModes: ['veil_as_decoration', 'worst_position_caricature'],
    compatibleWith: ['cognitive.perspective-reconciliation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['ethics.rawlsian-justice']
  }),
  K({
    id: 'cognitive.assumption-inversion',
    label: "Inversion d'hypothèse",
    operation: 'assumption-inversion',
    instruction: "Prendre l'hypothese la plus centrale du raisonnement courant et l'inverser. Explorer ce que le probleme devient si l'inverse est vrai. Ne pas chercher a prouver l'inverse : chercher ce que revele l'espace ouvert.",
    questions: [
      'Quelle est l hypothese la plus centrale ?',
      'Que devient le probleme si son inverse est vrai ?',
      'Qu est-ce que l espace ouvert revele ?'
    ],
    inputs: ['current_reasoning'],
    outputs: ['central_assumptions', 'inverted_variants', 'revealed_space'],
    usefulWhen: ['hypothesis_lock_in', 'stagnation', 'premature_convergence'],
    failureModes: ['contrarian_reflex', 'inverting_periphery'],
    compatibleWith: ['cognitive.frame-analysis'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['school.nietzsche', 'school.deleuze']
  }),
  K({
    id: 'cognitive.perspective-reconciliation',
    label: 'Réconciliation de perspectives',
    operation: 'perspective-reconciliation',
    instruction: 'Pour deux analyses incompatibles du meme probleme : identifier les conditions dans lesquelles chacune est vraie, chercher le niveau de description ou les deux se tiennent, et formuler explicitement ce qui reste irreconciliable.',
    questions: [
      'Dans quelles conditions chaque analyse est-elle vraie ?',
      'A quel niveau de description les deux se tiennent-elles ?',
      'Qu est-ce qui reste irreconciliable ?'
    ],
    inputs: ['analysis_a', 'analysis_b'],
    outputs: ['validity_conditions', 'reconciliation_level', 'irreconcilable_residue'],
    usefulWhen: ['analysis_conflict', 'false_dichotomy_risk'],
    failureModes: ['false_synthesis', 'forced_reconciliation'],
    compatibleWith: ['cognitive.assumption-inversion'],
    conflictsWith: [],
    cost: 'high',
    evidenceRequired: false,
    derivedFrom: ['school.hegelianism']
  })
];

module.exports = { COGNITIVE_KEYS };
