'use strict';

/**
 * Cognitive Key System — famille interprétation & jeu (ADR 0033, point 2).
 *
 * Clés issues de l'interprétation, de la narration, du jeu et de la
 * variation : intention, dépendances, isolation expérimentale, aléa,
 * confrontation, simulation de rôle, exaptation.
 */

const K = (def) => def;

const INTERPRETATION_KEYS = [
  K({
    id: 'cognitive.reference-comparison',
    label: 'Comparaison modèle / référent',
    operation: 'reference-comparison',
    instruction: "Comparer explicitement le modele et son referent : ce que le modele represente, ce qu'il ne represente pas, ce qu'il déforme. La fidelite d'un modele se mesure a ce qu'il ne montre pas.",
    questions: [
      'Que represente ce modele, et que ne represente-t-il pas ?',
      'Ou déforme-t-il son referent ?'
    ],
    inputs: ['model', 'referent'],
    outputs: ['represented_aspects', 'omitted_aspects', 'distortion_map'],
    usefulWhen: ['model_inflation', 'representation_fidelity_risk'],
    failureModes: ['mistaking_model_for_thing', 'omission_blindness'],
    compatibleWith: ['cognitive.frame-analysis', 'cognitive.observation-inference-separation'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['art.mimesis']
  }),
  K({
    id: 'cognitive.intention-bracketing',
    label: "Bracketing de l'intention",
    operation: 'intention-bracketing',
    instruction: "Suspendre la question de l'intention du producteur et analyser l'artefact uniquement par ses effets internes et son usage. Puis reintroduire l'intention comme une interpretation parmi d'autres, jamais comme autorite.",
    questions: [
      "Que fait l'artefact sans l'intention de son producteur ?",
      "L'intention est-elle une interpretation parmi d'autres ?"
    ],
    inputs: ['artifact', 'producer_claim'],
    outputs: ['artifact_internal_effects', 'usage_based_interpretation', 'intention_as_interpretation'],
    usefulWhen: ['authority_bias', 'intent_overread'],
    failureModes: ['author_cult', 'ignoring_context_of_reception'],
    compatibleWith: ['cognitive.reference-comparison', 'cognitive.dependency-search'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['interpretation.death-of-author']
  }),
  K({
    id: 'cognitive.dependency-search',
    label: 'Recherche de dépendances cachées',
    operation: 'dependency-search',
    instruction: "Chercher les dependances non declarees entre artefacts : un texte qui en presuppose un autre, un module qui en incorpore un autre, une solution qui en recycle une autre. Cartographier ces dependances meme non intentionnelles.",
    questions: [
      'Quel artefact cet artefact presuppose-t-il ?',
      'Quelle solution est recyclee sans le declarer ?'
    ],
    inputs: ['artifact'],
    outputs: ['hidden_dependencies', 'recycled_solutions_map'],
    usefulWhen: ['originality_overclaim', 'hidden_coupling'],
    failureModes: ['dependency_paranoia', 'tracing_to_everything'],
    compatibleWith: ['cognitive.intention-bracketing', 'cognitive.exaptive-reuse'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['interpretation.intertextuality']
  }),
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
    compatibleWith: ['cognitive.falsification-search', 'cognitive.controlled-variation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['play.magic-circle']
  }),
  K({
    id: 'cognitive.controlled-variation',
    label: 'Variation contrôlée',
    operation: 'controlled-variation',
    instruction: "Injecter une variation deliberee et bornee : parametre perturbe, hypothese inversee, entree aleatoire. Observer ce qui est robuste a la variation et ce qui s'effondre. La variation est un instrument de mesure, pas une fin.",
    questions: [
      'Quel parametre perturber, dans quelle borne ?',
      'Qu est-ce qui est robuste a la perturbation ?',
      'Qu est-ce qui s effondre ?'
    ],
    inputs: ['system_or_hypothesis'],
    outputs: ['perturbed_variants', 'robustness_map', 'fragility_sites'],
    usefulWhen: ['overfitting_suspicion', 'brittleness_risk'],
    failureModes: ['variation_as_noise', 'unbounded_perturbation'],
    compatibleWith: ['cognitive.experimental-isolation', 'cognitive.counterfactual-variation'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: true,
    derivedFrom: ['play.alea']
  }),
  K({
    id: 'cognitive.adversarial-confrontation',
    label: 'Confrontation adversariale',
    operation: 'adversarial-confrontation',
    instruction: "Confronter deux solutions candidates sur le meme probleme en cherchant le test ou l'une echoue et l'autre reussit. La confrontation doit produire un critere discriminant, pas un vainqueur par rhetorique.",
    questions: [
      'Sur quel test les deux solutions divergent-elles ?',
      'Quelle solution echoue ou, et pourquoi ?',
      'Le critere discriminant est-il independant des deux solutions ?'
    ],
    inputs: ['candidate_solutions'],
    outputs: ['discriminating_tests', 'failure_zones', 'independent_criterion'],
    usefulWhen: ['option_paralysis', 'premature_selection', 'weak_discrimination'],
    failureModes: ['rhetorical_victory', 'false_dichotomy', 'testing_where_they_agree'],
    compatibleWith: ['cognitive.falsification-search', 'cognitive.actor-simulation'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['play.agon']
  }),
  K({
    id: 'cognitive.actor-simulation',
    label: "Simulation d'acteur",
    operation: 'actor-simulation',
    instruction: "Endosser temporairement le role d'un acteur du systeme : adversaire, utilisateur hostile, composant defaillant, regulateur. Agir depuis ce role et observer le systeme depuis l'interieur du role.",
    questions: [
      'Quel acteur le raisonnement courant ignore-t-il ?',
      'Que ferait un adversaire a partir de cet etat ?',
      'Que voit-on depuis ce role que depuis aucun autre ?'
    ],
    inputs: ['system_description', 'role_catalog'],
    outputs: ['role_views', 'adversarial_moves', 'ignored_actor_blindspots'],
    usefulWhen: ['adversarial_risk', 'stakeholder_blindness'],
    failureModes: ['caricature_role', 'role_permanence'],
    compatibleWith: ['cognitive.viewpoint-change', 'cognitive.constraint-search'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['play.mimicry']
  }),
  K({
    id: 'cognitive.exaptive-reuse',
    label: 'Réutilisation exaptive',
    operation: 'exaptive-reuse',
    instruction: "Chercher une fonction existante qui resout le probleme actuel hors de sa fonction d'origine. Recenser les mecanismes disponibles du systeme, puis tester chacun contre le probleme sans egard pour sa fonction declaree.",
    questions: [
      'Quels mecanismes existants pourraient resoudre ce probleme ?',
      'Quelle fonction declaree doit-on ignorer pour le voir ?',
      'Le mecanisme retenu fonctionne-t-il sans modification structurelle ?'
    ],
    inputs: ['problem', 'available_mechanisms'],
    outputs: ['repurposed_mechanisms', 'structural_compatibility_check'],
    usefulWhen: ['solution_scarcity', 'build_vs_reuse_blindness'],
    failureModes: ['forced_analogy', 'ignoring_fit_constraints'],
    compatibleWith: ['cognitive.dependency-search', 'cognitive.possibility-space-expansion'],
    conflictsWith: [],
    cost: 'medium',
    evidenceRequired: false,
    derivedFrom: ['biomimetic.exaptation']
  }),
  K({
    id: 'cognitive.minimal-invariant-search',
    label: "Recherche de l'invariant minimal",
    operation: 'minimal-invariant-search',
    instruction: "Retirer des elements jusqu'a ce que la fonction visee disparaisse. Le plus petit ensemble qui conserve la fonction est l'invariant minimal. Tout ce qui a ete retire sans perte est decoratif.",
    questions: [
      'Que peut-on retirer sans perdre la fonction ?',
      'Quel est le plus petit ensemble qui fonctionne encore ?',
      'Qu est-ce qui etait decoratif ?'
    ],
    inputs: ['system_or_artifact'],
    outputs: ['minimal_core', 'decorative_elements'],
    usefulWhen: ['overengineering_suspicion', 'essentialism_about_parts'],
    failureModes: ['over_minimization', 'hidden_dependency_loss'],
    compatibleWith: ['cognitive.essence-accident-separation', 'cognitive.structural-abstraction'],
    conflictsWith: ['cognitive.possibility-space-expansion'],
    cost: 'medium',
    evidenceRequired: true,
    derivedFrom: ['style.minimalism']
  }),
  K({
    id: 'cognitive.possibility-space-expansion',
    label: "Expansion de l'espace des possibles",
    operation: 'possibility-space-expansion',
    instruction: "Avant de choisir, cartographier l'espace des solutions au-dela des candidates evidentes : variantes extremes, combinaisons, solutions hors domaine. Le choix est meilleur quand il est fait parmi plus de candidats.",
    questions: [
      'Quelles candidates n ont pas ete considerees ?',
      'Quelle solution existe dans un domaine voisin ?',
      'Quelle est la borne superieure du nombre de candidats raisonnables ?'
    ],
    inputs: ['problem_representation'],
    outputs: ['candidate_expansion', 'cross_domain_candidates'],
    usefulWhen: ['premature_convergence', 'candidate_poverty'],
    failureModes: ['unbounded_exploration', 'novelty_for_novelty'],
    compatibleWith: ['cognitive.representation-shift', 'cognitive.exaptive-reuse'],
    conflictsWith: ['cognitive.minimal-invariant-search'],
    cost: 'high',
    evidenceRequired: false,
    derivedFrom: ['style.maximalism']
  }),
  K({
    id: 'cognitive.reproduction-loss-analysis',
    label: 'Analyse de perte à la reproduction',
    operation: 'reproduction-loss-analysis',
    instruction: "Comparer l'original et ses copies ou reproductions : ce qui se conserve, ce qui se perd, ce qui se transforme. Ce qui se perd a chaque reproduction est l'identite du phenomene, ce qui se transforme est son mode de diffusion.",
    questions: [
      'Que perd une copie par rapport a l original ?',
      'Que gagne-t-elle ?',
      'Qu est-ce qui se perd a chaque reproduction ?'
    ],
    inputs: ['original', 'reproductions'],
    outputs: ['conserved_aspects', 'lost_aspects', 'transformed_aspects'],
    usefulWhen: ['copy_fidelity_illusion', 'identity_of_copies'],
    failureModes: ['original_fetishism', 'ignoring_gain'],
    compatibleWith: ['cognitive.reference-comparison', 'cognitive.dependency-search'],
    conflictsWith: [],
    cost: 'low',
    evidenceRequired: false,
    derivedFrom: ['cinema.mechanical-reproduction', 'cinema.aura']
  })
];

module.exports = { INTERPRETATION_KEYS };
