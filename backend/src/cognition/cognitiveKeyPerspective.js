'use strict';

/**
 * Cognitive Key System — famille perspectives & éthique (ADR 0033, point 2).
 *
 * Clés de positionnement : points de vue, positions défavorisées,
 * dépendances relationnelles, contraintes, conséquences, réconciliation.
 */

const K = (def) => def;

const PERSPECTIVE_KEYS = [
  K({
    id: 'cognitive.viewpoint-change',
    label: 'Changement de point de vue',
    operation: 'viewpoint-change',
    instruction: "Reconstruire le probleme depuis un autre observateur : le consommateur du resultat, l'adversaire, le composant ignore, l'outil. Verifier si l'interpretation change quand l'observateur change.",
    questions: [
      'Comment le consommateur du resultat voit-il le probleme ?',
      'Que voit le composant le plus ignore ?',
      "L'interpretation change-t-elle quand l'observateur change ?"
    ],
    inputs: ['problem_representation'],
    outputs: ['observer_variants', 'observer_dependent_facts'],
    usefulWhen: ['frame_blindness', 'single_observer_bias'],
    failureModes: ['caricature_observer', 'observer_inflation'],
    compatibleWith: ['cognitive.frame-analysis', 'cognitive.multi-perspective-projection'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['cinema.movement-image', 'cinema.time-image']
  }),
  K({
    id: 'cognitive.temporal-reordering',
    label: 'Réordonnancement temporel',
    operation: 'temporal-reordering',
    instruction: "Reordonner l'information dans le temps : commencer par la fin, par le milieu, ou par l'evenement le plus recent. Chercher ce que l'ordre chronologique standard cachait : causalites inversees, dependances non perceues.",
    questions: [
      "Que voit-on quand on commence par la fin ?",
      'Quelle causalite apparente s inverse quand on reordonne ?'
    ],
    inputs: ['event_sequence'],
    outputs: ['reordered_sequences', 'hidden_dependencies', 'reversed_causality_candidates'],
    usefulWhen: ['narrative_bias', 'sequence_blindness'],
    failureModes: ['false_temporal_pattern', 'forced_reordering'],
    compatibleWith: ['cognitive.viewpoint-change', 'cognitive.frame-analysis'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['cinema.time-image', 'cinema.crystal-image']
  }),
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
    compatibleWith: ['cognitive.relational-dependency-mapping', 'cognitive.consequence-aggregation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['ethics.rawlsian-justice']
  }),
  K({
    id: 'cognitive.relational-dependency-mapping',
    label: 'Cartographie des dépendances relationnelles',
    operation: 'relational-dependency-mapping',
    instruction: "Cartographier qui depend de qui : flux de dependance, asymetries, vulnerabilites relationnelles. Puis verifier si les dependances sont reconnues et reciproques, ou ignorees et a sens unique.",
    questions: [
      'Qui depend de qui dans cette solution ?',
      'Quelles dependances sont ignorees ?',
      'Sont-elles reciproques ?'
    ],
    inputs: ['candidate_solution'],
    outputs: ['dependency_map', 'asymmetry_sites', 'unrecognized_dependencies'],
    usefulWhen: ['relational_blindness', 'dependency_invisibility'],
    failureModes: ['dependency_inflation', 'ignoring_reciprocity'],
    compatibleWith: ['cognitive.least-favored-position', 'cognitive.dependency-search'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['ethics.care-ethics']
  }),
  K({
    id: 'cognitive.constraint-search',
    label: 'Recherche des contraintes non négociables',
    operation: 'constraint-search',
    instruction: "Separer les contraintes non negociables des preferences negociables. Pour chaque contrainte, verifier si elle est vraiment incompressible ou si elle n'est qu'une habitude. Ne jamais sacrifier une contrainte pour optimiser une preference.",
    questions: [
      'Quelles contraintes sont reellement incompressibles ?',
      'Quelles habitudes se deguisent en contraintes ?',
      'Une contrainte est-elle sacrifiee pour une preference ?'
    ],
    inputs: ['decision_space'],
    outputs: ['non_negotiable_constraints', 'negotiable_preferences', 'constraint_habits'],
    usefulWhen: ['constraint_confusion', 'over_constraint'],
    failureModes: ['everything_negotiable', 'everything_sacred'],
    compatibleWith: ['cognitive.adversarial-confrontation', 'cognitive.least-favored-position'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['ethics.categorical-imperative']
  }),
  K({
    id: 'cognitive.consequence-aggregation',
    label: 'Agrégation des conséquences',
    operation: 'consequence-aggregation',
    instruction: "Enumerer les consequences de chaque option pour toutes les parties affectees, les agreger explicitement, puis verifier si l'agregat masque une distribution inacceptable : un total eleve peut cacher une catastrophe localisee.",
    questions: [
      'Quelles sont les consequences pour chaque partie affectee ?',
      'Le total masque-t-il une catastrophe localisee ?'
    ],
    inputs: ['candidate_options'],
    outputs: ['per_party_consequences', 'aggregate_measures', 'distribution_analysis'],
    usefulWhen: ['aggregation_blindspot', 'local_catastrophe_risk'],
    failureModes: ['totalitarian_aggregation', 'ignoring_distribution'],
    compatibleWith: ['cognitive.least-favored-position', 'cognitive.relational-dependency-mapping'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['lens.utilitarianism']
  }),
  K({
    id: 'cognitive.perspective-reconciliation',
    label: 'Réconciliation de perspectives',
    operation: 'perspective-reconciliation',
    instruction: "Pour deux analyses incompatibles du meme probleme : identifier les conditions dans lesquelles chacune est vraie, chercher le niveau de description ou les deux se tiennent, et formuler explicitement ce qui reste irreconciliable.",
    questions: [
      'Dans quelles conditions chaque analyse est-elle vraie ?',
      'A quel niveau de description les deux se tiennent-elles ?',
      'Qu est-ce qui reste irreconciliable ?'
    ],
    inputs: ['analysis_a', 'analysis_b'],
    outputs: ['validity_conditions', 'reconciliation_level', 'irreconcilable_residue'],
    usefulWhen: ['analysis_conflict', 'false_dichotomy_risk'],
    failureModes: ['false_synthesis', 'forced_reconciliation'],
    compatibleWith: ['cognitive.multi-perspective-projection', 'cognitive.assumption-inversion'],
    conflictsWith: [],
    cost: 'high',
    evidenceRequired: false,
    derivedFrom: ['lens.hegelianism']
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
    compatibleWith: ['cognitive.paradigm-assumption-search', 'cognitive.perspective-reconciliation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['lens.nietzsche', 'lens.deleuze']
  }),
  K({
    id: 'cognitive.essence-accident-separation',
    label: 'Séparation essence / accident',
    operation: 'essence-accident-separation',
    instruction: "Pour chaque propriete du phenomene, determiner si elle est essentielle (le phenomene disparait sans elle) ou accidentelle (il survit). Traiter chaque propriete evidemment essentielle comme une hypothese a tester.",
    questions: [
      'Le phenomene survit-il a la perte de cette propriete ?',
      'Cette propriete evidemment essentielle est-elle testee ?'
    ],
    inputs: ['phenomenon'],
    outputs: ['essential_properties', 'accidental_properties', 'essence_tests'],
    usefulWhen: ['essentialism_risk', 'overfitting_to_instance'],
    failureModes: ['essence_inflation', 'accidental_universality'],
    compatibleWith: ['cognitive.minimal-invariant-search', 'cognitive.cause-decomposition'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: true,
    derivedFrom: ['school.aristotelianism']
  }),
  K({
    id: 'cognitive.cause-decomposition',
    label: 'Décomposition en quatre causes',
    operation: 'cause-decomposition',
    instruction: "Pour le phenomene, identifier separement : ce dont il est fait (materielle), sa forme ou organisation (formelle), le processus qui l'a produit (efficiente), la fonction vers laquelle il est organise (finale). Ne pas fusionner ces explications en une seule cause.",
    questions: [
      'De quoi est-ce fait ?',
      'Quelle organisation le constitue ?',
      'Quel processus l a produit ?',
      'Vers quelle fonction est-il organise ?'
    ],
    inputs: ['phenomenon'],
    outputs: ['material_cause', 'formal_cause', 'efficient_cause', 'final_cause'],
    usefulWhen: ['explanatory_poverty', 'single_cause_fallacy'],
    failureModes: ['cause_conflation', 'inventing_final_causes'],
    compatibleWith: ['cognitive.essence-accident-separation', 'cognitive.emergence-detection'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['school.aristotelianism']
  }),
  K({
    id: 'cognitive.potency-actualization',
    label: 'Puissance en acte',
    operation: 'potency-actualization',
    instruction: "Distinguer ce que le systeme fait actuellement de ce qu'il peut faire sans modification structurelle. Chercher les capacites latentes : etats accessibles, transitions non empruntees, capacites non actualisees.",
    questions: [
      'Que fait le systeme actuellement ?',
      'Que pourrait-il faire sans modification structurelle ?',
      'Quelles transitions sont accessibles mais non empruntees ?'
    ],
    inputs: ['system_description'],
    outputs: ['actual_states', 'potential_states', 'latent_capacities'],
    usefulWhen: ['actualism_bias', 'latent_capacity_blindness'],
    failureModes: ['potentiality_inflation', 'ignoring_activation_cost'],
    compatibleWith: ['cognitive.possibility-space-expansion', 'cognitive.exaptive-reuse'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['process.actuality-potentiality']
  })
];

module.exports = { PERSPECTIVE_KEYS };
