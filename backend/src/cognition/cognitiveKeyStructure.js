'use strict';

/**
 * Cognitive Key System — famille structure & représentation (ADR 0033, point 2).
 *
 * Clés de transformation de la représentation du problème : relations,
 * catégories, cadrage, niveaux d'abstraction.
 */

const K = (def) => def;

const STRUCTURE_KEYS = [
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
    compatibleWith: ['cognitive.counterfactual-variation', 'cognitive.emergence-detection'],
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
    compatibleWith: ['cognitive.boundary-probe', 'cognitive.hypostatization-detection'],
    conflictsWith: ['cognitive.structural-abstraction'],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['mathematics.nominalism']
  }),
  K({
    id: 'cognitive.reduction',
    label: 'Décomposition réductionniste',
    operation: 'reduction',
    instruction: "Decomposer le phenomene en ses composants les plus fins, expliquer chaque composant, puis verifier si la recomposition restitue le comportement global. Si elle echoue, noter precisement ce qui manque : c'est un candidat a propriete emergente.",
    questions: [
      'Quels sont les composants les plus fins ?',
      'La recomposition restitue-t-elle le comportement global ?',
      'Qu est-ce qui manque exactement a la recomposition ?'
    ],
    inputs: ['phenomenon'],
    outputs: ['components', 'recomposition_gap', 'emergence_candidates'],
    usefulWhen: ['complexity', 'need_for_mechanism'],
    failureModes: ['composition_fallacy', 'losing_interactions'],
    compatibleWith: ['cognitive.emergence-detection', 'cognitive.cause-decomposition'],
    conflictsWith: ['cognitive.emergence-detection'],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['metaphysics.reductionism']
  }),
  K({
    id: 'cognitive.emergence-detection',
    label: "Détection d'émergence",
    operation: 'emergence-detection',
    instruction: "Chercher les proprietes globales que les composants seuls ne possedent pas et que leur simple addition ne produit pas. Pour chaque propriete candidate, verifier si elle disparait quand on isole les composants.",
    questions: [
      'Cette propriete globale existe-t-elle pour un composant isole ?',
      'La somme des proprietes locales la produit-elle ?',
      'Que se passe-t-il quand on isole les composants ?'
    ],
    inputs: ['system_description'],
    outputs: ['global_property_candidates', 'isolation_tests'],
    usefulWhen: ['complexity', 'system_behavior_mystery'],
    failureModes: ['labeling_as_emergence', 'missing_underlying_mechanism'],
    compatibleWith: ['cognitive.structural-abstraction', 'cognitive.reduction'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['metaphysics.emergence']
  }),
  K({
    id: 'cognitive.representation-shift',
    label: 'Changement de représentation',
    operation: 'representation-shift',
    instruction: "Representer le probleme dans au moins deux formalismes differents et chercher celui qui rend la solution triviale. Si aucune representation ne rend la solution triviale, changer de point de vue sur ce qui compte comme solution.",
    questions: [
      'Dans quel formalisme ce probleme devient-il trivial ?',
      'Que compte-t-on comme solution, et cette definition est-elle la bonne ?'
    ],
    inputs: ['problem_representation'],
    outputs: ['alternative_representations', 'trivializing_representation'],
    usefulWhen: ['representation_lock_in', 'stagnation'],
    failureModes: ['single_representation_lock_in', 'decorative_shift'],
    compatibleWith: ['cognitive.paradigm-assumption-search', 'cognitive.multi-perspective-projection'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['lens.deleuze']
  }),
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
    compatibleWith: ['cognitive.viewpoint-change', 'cognitive.boundary-probe'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['cinema.film-narration', 'cinema.cognitive-theory']
  }),
  K({
    id: 'cognitive.multi-perspective-projection',
    label: 'Projection multiperspective',
    operation: 'multi-perspective-projection',
    instruction: "Construire simultanement plusieurs projections incompatibles du meme objet (vue structurelle, vue fonctionnelle, vue historique, vue adversariale), puis chercher leurs invariants : ce que toutes les projections montrent malgre leur incompatibilite.",
    questions: [
      'Quelles projections incompatibles du meme objet peut-on construire ?',
      'Que montrent-elles toutes malgre leur incompatibilite ?'
    ],
    inputs: ['object_of_study'],
    outputs: ['incompatible_projections', 'cross_projection_invariants'],
    usefulWhen: ['single_view_lock_in', 'partial_model_conflict'],
    failureModes: ['projection_averaging', 'false_invariants'],
    compatibleWith: ['cognitive.structural-abstraction', 'cognitive.representation-shift'],
    conflictsWith: [],
    cost: 'high',
    evidenceRequired: false,
    derivedFrom: ['style.cubism']
  })
];

module.exports = { STRUCTURE_KEYS };
