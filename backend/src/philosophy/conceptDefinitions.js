'use strict';

/**
 * Canonical philosophical vocabulary.
 *
 * This file is declarative on purpose: it records what GenOS knows about a
 * concept without pretending that every concept is an executable capability.
 */

const FAMILY_BY_DOMAIN = Object.freeze({
  ontology: 'ontology',
  modality: 'metaphysics',
  schools: 'philosophical-traditions',
  metaphysics: 'metaphysics',
  phenomenology: 'phenomenology',
  causality: 'metaphysics',
  'time-space': 'metaphysics',
  process: 'process-philosophy',
  epistemology: 'epistemology',
  methods: 'epistemology',
  science: 'philosophy-of-science',
  truth: 'epistemology',
  'social-epistemology': 'social-and-critical-thought',
  politics: 'political-power',
  aesthetics: 'aesthetics',
  'art-theory': 'aesthetics',
  interpretation: 'aesthetics',
  play: 'aesthetics',
  narrative: 'aesthetics',
  cinema: 'aesthetics',
  music: 'aesthetics',
  architecture: 'aesthetics',
  design: 'aesthetics',
  'digital-art': 'aesthetics',
  video: 'aesthetics',
  'art-movements': 'aesthetics',
});

const { CORE_DEFINITIONS } = require('./coreDefinitions');
const { AESTHETICS_DEFINITIONS } = require('./aestheticsDefinitions');

const C = (id, ...fields) => {
  const [label, domain, school, status, service = null, metadata = {}] = fields;
  return {
    id, label, domain, school, status, service,
    family: metadata.family || FAMILY_BY_DOMAIN[domain] || domain,
    ...metadata,
  };
};

const RAW_CONCEPT_DEFINITIONS = [
  C('ontology.being', 'Être / Being / ensoma', 'ontology', 'general', 'implemented', 'ontologyCore'),
  C('ontology.substance', 'Substance / Sostanza', 'ontology', 'aristotle-spinoza-descartes', 'implemented', 'substanceService'),
  C('ontology.attribute', 'Attribut / Propriété', 'ontology', 'general', 'implemented', 'ontologyAttributes'),
  C('ontology.mode', 'Mode / Modalité', 'ontology', 'general', 'implemented', 'ontologyModes'),
  C('ontology.essence-accident', 'Essentia / Accident', 'ontology', 'aristotle-scholastic', 'implemented', 'ontologyAttributes'),
  C('ontology.hypostatization', 'Hypostatisation', 'ontology', 'scholastic', 'implemented', 'ontologyHypostatization'),
  C('ontology.stances', 'Réalisme / Nominalisme / Conceptualisme', 'ontology', 'medieval-modern', 'implemented', 'ontologyStances'),
  C('ontology.identity-change', 'Identité et changement', 'ontology', 'locke', 'implemented', 'temporalIdentityService'),
  C('ontology.person-other', 'Personne / Autrui / Altérité', 'ontology', 'levinas', 'planned'),
  C('ontology.whole-void-infinite', 'Tout / Vide / Infini', 'ontology', 'metaphysics', 'partial'),
  C('ontology.continuous-discrete', 'Continu / Discontinu', 'ontology', 'metaphysics', 'planned'),
  C('ontology.possible-worlds', 'Mondes possibles / Possibilia', 'modality', 'leibniz-kripke', 'planned'),
  C('ontology.contingency-necessity', 'Contingence / Nécessité logique et métaphysique', 'modality', 'modal-metaphysics', 'partial', 'contingencyService'),

  C('school.platonism', 'Platonisme : formes idéales', 'schools', 'plato', 'implemented', 'platonismService'),
  C('school.aristotelianism', 'Aristotélisme : catégories et causes', 'schools', 'aristotle', 'implemented', 'aristotelianService'),
  C('school.stoicism', 'Stoïcisme : monisme, logos, fate', 'schools', 'stoicism', 'implemented', 'stoicismService'),
  C('school.epicureanism', 'Épicurisme : atomes, vide, sensations', 'schools', 'epicurus', 'implemented', 'epicureanService'),
  C('school.scholasticism', 'Scholastique : équivocité, analogie, univocité', 'schools', 'scholastic', 'implemented', 'scholastiqueService'),
  C('school.cartesianism', 'Cartesianisme : res cogitans / res extensa', 'schools', 'descartes', 'implemented', 'cartesianService'),
  C('school.leibnizianism', 'Leibniz : monades et harmonie préétablie', 'schools', 'leibniz', 'implemented', 'leibnizianService'),
  C('school.spinozism', 'Spinozisme : Deus sive Natura et conatus', 'schools', 'spinoza', 'implemented', 'spinozaService'),
  C('school.newtonianism', 'Newton : espace et temps absolus', 'schools', 'newton', 'implemented', 'newtonianService'),
  C('school.kantianism', 'Kant : noumène, phénomène, catégories a priori', 'schools', 'kant', 'implemented', 'kantianService'),
  C('school.hegelianism', 'Hegel : dialectique et Absolute Geist', 'schools', 'hegel', 'implemented', 'hegelianService'),
  C('school.schopenhauer', 'Schopenhauer : volonté et représentation', 'schools', 'schopenhauer', 'implemented', 'schopenhauerService'),
  C('school.nietzsche', 'Nietzsche : volonté de puissance et éternel retour', 'schools', 'nietzsche', 'implemented', 'nietzscheService'),
  C('school.bergsonism', 'Bergson : durée, élan vital, intuition', 'schools', 'bergson', 'implemented', 'bergsonService'),
  C('school.whitehead', 'Whitehead : processus, actualité, potentialité', 'schools', 'whitehead', 'implemented', 'processPhilosophyService'),
  C('school.heidegger', 'Heidegger : Être-et-Temps, Sein, Dasein', 'schools', 'heidegger', 'implemented', 'processPhilosophyService'),
  C('school.sartre', 'Sartre : existence, essence, mauvaise foi', 'schools', 'sartre', 'implemented', 'phenomenologyService'),
  C('school.merleau-ponty', 'Merleau-Ponty : phénoménologie de la perception', 'schools', 'merleau-ponty', 'implemented', 'phenomenologyService'),
  C('school.deleuze', 'Deleuze : différence, répétition, rhizome', 'schools', 'deleuze', 'implemented', 'processPhilosophyService'),
  C('school.badiou', 'Badiou : événement, vérité, mathématiques de l’être', 'schools', 'badiou', 'implemented', 'contingencyService'),
  C('school.meillassoux', 'Meillassoux : contingence absolue', 'schools', 'meillassoux', 'implemented', 'contingencyService'),
  C('school.speculative-realism', 'Réalisme spéculatif : corrélationisme, accessibilité', 'schools', 'speculative-realism', 'planned'),

  C('metaphysics.monism-idealism', 'Monisme idéaliste', 'metaphysics', 'berkeley-hegel', 'planned'),
  C('metaphysics.dualism', 'Dualisme des substances', 'metaphysics', 'descartes', 'implemented', 'cartesianService'),
  C('metaphysics.material-monism', 'Monisme matériel / Physicalisme', 'metaphysics', 'physicalism', 'partial', 'propertyService'),
  C('metaphysics.panpsychism', 'Panpsychisme / Panexperientialisme', 'metaphysics', 'contemporary', 'planned'),
  C('metaphysics.eliminativism', 'Éliminativisme matérialiste', 'metaphysics', 'churchland', 'planned'),
  C('metaphysics.reductionism', 'Réductionnisme', 'metaphysics', 'analytic', 'partial', 'propertyService'),
  C('metaphysics.emergence', 'Émergence / propriété émergente', 'metaphysics', 'analytic', 'implemented', 'propertyService'),
  C('metaphysics.supervenience', 'Supervenience / supervenience psychophysique', 'metaphysics', 'analytic', 'implemented', 'propertyService'),
  C('metaphysics.second-order-properties', 'Propriétés de deuxième ordre', 'metaphysics', 'analytic', 'planned'),
  C('metaphysics.mind-body', 'Matière, esprit, conscience et problème corps-esprit', 'metaphysics', 'mind-body', 'partial', 'consciousnessService'),
  C('metaphysics.qualia', 'Qualia', 'phenomenology', 'contemporary', 'implemented', 'consciousnessService'),
  C('metaphysics.cartesian-pineal', 'Épine / glande pinéale de Descartes', 'metaphysics', 'descartes', 'implemented', 'cartesianService'),
  C('metaphysics.reference-intentionality', 'Référence et intentionnalité', 'phenomenology', 'brentano-husserl', 'implemented', 'phenomenologyService'),

  C('causality.determination', 'Détermination / Causalité', 'causality', 'general', 'implemented', 'causalityService'),
  C('causality.hume-regularity', 'Loi et régularité causationnelles : Hume', 'causality', 'hume', 'implemented', 'causalityService'),
  C('causality.counterfactuals', 'Conditionnels contrefactuels', 'causality', 'lewis', 'implemented', 'causalityService'),
  C('causality.determinism-indeterminism', 'Déterminisme / Indéterminisme', 'causality', 'metaphysics', 'implemented', 'causalityService'),
  C('causality.fatalism', 'Fatalisme', 'causality', 'stoicism', 'implemented', 'stoicismService'),
  C('causality.free-will', 'Libre arbitre, compatibilisme, incompatibilisme, libertarianisme', 'causality', 'analytic', 'implemented', 'causalityService'),

  C('time.newtonian', 'Temps absolu et espace absolu', 'time-space', 'newton', 'implemented', 'newtonianService'),
  C('time.duration', 'Temps et durée', 'time-space', 'bergson-mctaggart', 'implemented', 'bergsonService'),
  C('time.a-series-b-series', 'A-series / B-series', 'time-space', 'mctaggart', 'implemented', 'temporalIdentityService'),
  C('time.block-universe', 'Bloc univers : éternalisme / présentisme', 'time-space', 'contemporary', 'implemented', 'temporalIdentityService'),
  C('time.arrow', 'Flèche du temps / asymétrie temporelle', 'time-space', 'physics', 'implemented', 'temporalIdentityService'),
  C('time.spacetime-relativity', 'Espace-temps relativiste', 'time-space', 'einstein', 'implemented', 'temporalIdentityService'),

  C('process.actuality-potentiality', 'Actualité / Potentialité', 'process', 'whitehead-aristotle', 'implemented', 'processPhilosophyService'),
  C('process.bergsonian-vital-impulse', 'Durée / Élan vital / Intuition', 'process', 'bergson', 'implemented', 'bergsonService'),
  C('process.heidegger-dasein', 'Sein / Dasein / Être-et-Temps', 'process', 'heidegger', 'implemented', 'processPhilosophyService'),
  C('process.deleuze-difference', 'Différence / Répétition / Rhizome', 'process', 'deleuze', 'implemented', 'processPhilosophyService'),
  C('process.badiou-event', 'Événement / Vérité', 'process', 'badiou', 'implemented', 'contingencyService'),
  C('process.sartrean-existence', 'Existence précède essence / mauvaise foi', 'process', 'sartre', 'implemented', 'phenomenologyService'),

  // Épistémologie — nature, portée et formes du savoir.
  C('epistemology.knowledge', 'Savoir / Knowledge', 'epistemology', 'general', 'partial', 'epistemics'),
  C('epistemology.tripartite-definition', 'Définition tripartite : croyance vraie justifiée', 'epistemology', 'plato-gettier', 'planned'),
  C('epistemology.gettier-problem', 'Problème de Gettier et contre-exemples', 'epistemology', 'gettier', 'partial', 'knowledgeService'),
  C('epistemology.post-gettier-defenses', 'Défenses post-Gettier', 'epistemology', 'contemporary', 'partial', 'knowledgeService'),
  C('epistemology.belief', 'Croyance / Belief', 'epistemology', 'general', 'partial', 'epistemics'),
  C('epistemology.justification', 'Justification épistémique', 'epistemology', 'analytic', 'partial', 'epistemics'),
  C('epistemology.truth', 'Vérité et connaissance', 'epistemology', 'general', 'partial', 'epistemics'),
  C('epistemology.plausibility', 'Vraisemblance / Probabilisme', 'epistemology', 'probabilism', 'partial', 'probabilityService'),
  C('epistemology.certainty-doubt', 'Certitude / Doute', 'epistemology', 'general', 'planned'),
  C('epistemology.doxa', 'Opinion / Doxa', 'epistemology', 'plato', 'planned'),
  C('epistemology.propositional-knowledge', 'Connaissance propositionnelle', 'epistemology', 'russell', 'planned'),
  C('epistemology.acquaintance', 'Connaissance par acquaintance', 'epistemology', 'russell', 'planned'),
  C('epistemology.know-how', 'Connaissance pratique / Savoir-faire', 'epistemology', 'ryle', 'planned'),
  C('epistemology.knowledge-wh', 'Connaissance de type knowledge-wh', 'epistemology', 'contemporary', 'planned'),
  C('epistemology.gettierized-knowledge', 'Connaissance gettierisée', 'epistemology', 'gettier', 'partial', 'knowledgeService'),
  C('epistemology.knowledge-first', 'Knowledge-first epistemology', 'epistemology', 'williamson', 'planned'),
  C('epistemology.knowledge-assertion', 'Knowledge account of assertion', 'epistemology', 'williamson-turri', 'planned'),
  C('epistemology.rationality-norms', 'Rationalité et normes de croyance', 'epistemology', 'analytic', 'partial', 'epistemics'),
  C('epistemology.context-discovery-justification', 'Contexte de découverte / justification', 'epistemology', 'reichenbach', 'planned'),

  // Écoles et positions épistémologiques.
  C('school.empiricism', 'Empirisme : Locke, Berkeley, Hume', 'schools', 'locke-berkeley-hume', 'planned'),
  C('school.rationalism', 'Rationalisme : Descartes, Spinoza, Leibniz', 'schools', 'descartes-spinoza-leibniz', 'partial', 'epistemologyService'),
  C('school.verificationism', 'Vérificationnisme et positivisme logique', 'schools', 'vienna-circle', 'planned'),
  C('school.falsificationism', 'Falsificationnisme', 'schools', 'popper', 'planned'),
  C('school.pragmatism', 'Pragmatisme : Peirce, James, Dewey, Rorty', 'schools', 'pragmatism', 'planned'),
  C('school.feminist-epistemology', 'Épistémologie féministe', 'schools', 'feminist-epistemology', 'planned'),
  C('school.social-epistemology', 'Épistémologie sociale', 'schools', 'social-epistemology', 'partial', 'epistemics'),
  C('school.naturalized-epistemology', 'Épistémologie naturalisée', 'schools', 'quine-neurath', 'planned'),
  C('school.standpoint-theory', 'Standpoint theory', 'schools', 'hartsock-harding', 'planned'),
  C('school.situated-knowledges', 'Savoirs situés / Situated knowledges', 'schools', 'haraway', 'planned'),

  // Raisonnement et méthode.
  C('method.induction', 'Induction', 'methods', 'hume', 'partial', 'inferenceService'),
  C('method.induction-problem', 'Problème de l’induction', 'methods', 'hume-wittgenstein', 'planned'),
  C('method.deduction', 'Déduction et logique déductive', 'methods', 'logic', 'partial', 'inferenceService'),
  C('method.abduction', 'Abduction', 'methods', 'peirce', 'partial', 'inferenceService'),
  C('method.inference-best-explanation', 'Inférence à la meilleure explication', 'methods', 'peirce', 'partial', 'inferenceService'),
  C('method.hypothetico-deductive', 'Méthode hypothético-déductive', 'methods', 'science-method', 'planned'),
  C('method.surprise-predictivism', 'Surprise et predictivism', 'methods', 'predictivism', 'planned'),
  C('method.dutch-book', 'Arguments Dutch book et cohérence', 'methods', 'ramsey-de-finetti', 'planned'),
  C('method.bayesianism', 'Bayésianisme et règle de Bayes', 'methods', 'bayes', 'partial', 'probabilityService'),
  C('method.objective-subjective-probability', 'Probabilisme objectif / subjectif', 'methods', 'probabilism', 'partial', 'probabilityService'),
  C('method.bayesian-confirmation', 'Confirmation bayésienne', 'methods', 'carnap-hempel', 'planned'),

  // Science, confirmation et changement théorique.
  C('science.confirmation', 'Théorie de la confirmation', 'science', 'carnap-hempel', 'planned'),
  C('science.raven-paradox', 'Paradoxe des corbeaux', 'science', 'hempel', 'planned'),
  C('science.duhem-quine', 'Thèse de Duhem-Quine et holisme épistémique', 'science', 'duhem-quine', 'planned'),
  C('science.falsification-demarcation', 'Falsification et problème de la démarcation', 'science', 'popper', 'planned'),
  C('science.progress', 'Progrès de la science et programmes de recherche', 'science', 'lakatos', 'planned'),
  C('science.paradigm-incommensurability', 'Changements de paradigmes et incommensurabilité', 'science', 'kuhn', 'planned'),
  C('science.normal-revolutionary', 'Science normale et révolutionnaire', 'science', 'kuhn', 'planned'),
  C('science.godel-incompleteness', 'Théorèmes d’incomplétude et limites formelles', 'science', 'godel', 'planned'),

  // Théories de la vérité.
  C('truth.correspondence', 'Théorie de la correspondance', 'truth', 'russell-early-wittgenstein', 'planned'),
  C('truth.coherence', 'Théorie de la cohérence', 'truth', 'hegel-bradley-neurath', 'planned'),
  C('truth.pragmatist', 'Théorie pragmatiste de la vérité', 'truth', 'peirce-james-dewey-rorty', 'planned'),
  C('truth.deflationary', 'Théories déflationnistes de la vérité', 'truth', 'ramsey-strawson-horwich', 'planned'),
  C('truth.minimalism', 'Vérité minimaliste / minimalisme', 'truth', 'horwich', 'planned'),
  C('truth.internal-realism', 'Vérité et conséquences / réalisme interne', 'truth', 'putnam', 'planned'),

  // Fiabilité, scepticisme et limites de la connaissance.
  C('epistemology.reliabilism', 'Fiabilité cognitive / Reliabilisme', 'epistemology', 'goldman', 'partial', 'epistemics'),
  C('epistemology.process-reliabilism', 'Process reliabilism', 'epistemology', 'goldman', 'planned'),
  C('epistemology.indicator-reliabilism', 'Indicator reliabilism', 'epistemology', 'reliabilism', 'planned'),
  C('epistemology.virtue-epistemology', 'Virtue epistemology', 'epistemology', 'zagzebski-sosa', 'planned'),
  C('epistemology.intellectual-virtue-vice', 'Vertu / vice intellectuel', 'epistemology', 'virtue-epistemology', 'planned'),
  C('epistemology.causal-theory-knowledge', 'Théorie causale de la connaissance', 'epistemology', 'causal-epistemology', 'planned'),
  C('epistemology.relativism', 'Relativisme épistémique et culturel', 'epistemology', 'relativism', 'planned'),
  C('epistemology.skepticism', 'Scepticisme : Pyrrhon, Académiciens, Montaigne, Hume', 'epistemology', 'skepticism', 'planned'),
  C('epistemology.radical-skepticism', 'Scepticisme radical', 'epistemology', 'contemporary', 'planned'),
  C('epistemology.cartesian-doubt', 'Doute cartésien / doute méthodique', 'epistemology', 'descartes', 'partial', 'cartesianService'),

  // Épistémologie sociale, féministe et critique.
  C('social-epistemology.testimony', 'Témoignage et transmission du savoir', 'social-epistemology', 'testimony', 'partial', 'epistemics'),
  C('social-epistemology.discussion', 'Discussion, désaccord et épistémologie sociale', 'social-epistemology', 'social-epistemology', 'planned'),
  C('social-epistemology.cognitive-labor', 'Division du travail cognitif', 'social-epistemology', 'social-epistemology', 'planned'),
  C('social-epistemology.feminist', 'Épistémologie féministe et critique des savoirs', 'social-epistemology', 'feminist-epistemology', 'planned'),
  C('social-epistemology.emancipatory-critique', 'Émancipation épistémique et critique', 'social-epistemology', 'frankfurt-school', 'planned'),

  // Éthique normative — noyau évaluatif sans autorisation d'exécution.
  C('ethics.consequentialism', 'Conséquentialisme', 'normative-ethics', 'contemporary', 'partial', 'normativeEthicsService'),
  C('ethics.utilitarianism', 'Utilitarisme', 'normative-ethics', 'bentham-mill-singer', 'implemented', 'normativeEthicsService'),
  C('ethics.act-utilitarianism', 'Utilitarisme de l’acte', 'normative-ethics', 'bentham-singer', 'implemented', 'normativeEthicsService'),
  C('ethics.rule-utilitarianism', 'Utilitarisme de la règle', 'normative-ethics', 'mill', 'implemented', 'normativeEthicsService'),
  C('ethics.hedonism', 'Hédonisme, plaisir et utilité', 'normative-ethics', 'epicurus-bentham', 'partial', 'normativeEthicsService'),
  C('ethics.deontology', 'Déontologie', 'normative-ethics', 'kant', 'implemented', 'normativeEthicsService'),
  C('ethics.categorical-imperative', 'Impératif catégorique', 'normative-ethics', 'kant', 'implemented', 'normativeEthicsService'),
  C('ethics.double-effect', 'Doctrine du double effet', 'normative-ethics', 'aquinas', 'implemented', 'normativeEthicsService'),
  C('ethics.virtue-ethics', 'Éthique des vertus', 'normative-ethics', 'aristotle', 'implemented', 'normativeEthicsService'),
  C('ethics.social-contract', 'État de nature et contrat social', 'normative-ethics', 'hobbes-locke-rousseau', 'implemented', 'justiceEthicsService'),
  C('ethics.natural-rights', 'Droits naturels et droits humains', 'normative-ethics', 'locke', 'implemented', 'justiceEthicsService'),
  C('ethics.contractarianism', 'Contractarianisme', 'normative-ethics', 'rawls-scanlon-gauthier', 'partial', 'justiceEthicsService'),
  C('ethics.rawlsian-justice', 'Justice comme équité', 'normative-ethics', 'rawls', 'implemented', 'justiceEthicsService'),
  C('ethics.distributive-justice', 'Justice distributive', 'normative-ethics', 'contemporary', 'implemented', 'justiceEthicsService'),
  C('ethics.libertarianism', 'Libertarianisme et entitlement theory', 'normative-ethics', 'nozick', 'implemented', 'justiceEthicsService'),
  C('ethics.equality-of-opportunity', 'Égalité des chances', 'normative-ethics', 'political-philosophy', 'partial', 'justiceEthicsService'),
  C('ethics.retributive-restorative-justice', 'Justice rétributive et réparatrice', 'normative-ethics', 'contemporary', 'partial', 'justiceEthicsService'),
  C('ethics.care-ethics', 'Éthique du care', 'normative-ethics', 'gilligan-noddings-tronto', 'implemented', 'relationalEthicsService'),
  C('ethics.care-deontology', 'Éthique déontologique du care', 'normative-ethics', 'care-ethics', 'implemented', 'relationalEthicsService'),
  C('ethics.responsibility-other', 'Responsabilité et autrui', 'normative-ethics', 'levinas', 'implemented', 'relationalEthicsService'),

  // Philosophie politique — noyau analytique sans autorisation d'exécution.
  C('politics.regime-classification', 'Régimes politiques : démocratie, autoritarisme, dictature', 'politics', 'weber-dahl', 'implemented', 'politicalPhilosophyService'),
  C('politics.legitimacy', 'État, souveraineté et légitimité', 'politics', 'weber-bodin-hobbes', 'implemented', 'politicalPhilosophyService'),
  C('politics.social-contract', 'Contrat social', 'politics', 'hobbes-locke-rousseau-kant', 'implemented', 'politicalPhilosophyService'),
  C('politics.liberty-authority', 'Liberté et autorité', 'politics', 'political-philosophy', 'implemented', 'politicalPhilosophyService'),
  C('politics.separation-of-powers', 'Séparation des pouvoirs', 'politics', 'montesquieu', 'implemented', 'politicalPhilosophyService'),
  C('politics.democratic-participation', 'Démocratie directe, représentative et délibérative', 'politics', 'habermas-rawls', 'implemented', 'politicalPhilosophyService'),
  C('politics.pluralism', 'Pluralisme politique', 'politics', 'dahl', 'implemented', 'politicalPhilosophyService'),
  C('politics.civil-disobedience', 'Désobéissance civile', 'politics', 'thoreau-gandhi-mlk-arendt-rawls', 'implemented', 'politicalPhilosophyService'),
  C('politics.security-liberty-surveillance', 'Sécurité, liberté et surveillance', 'politics', 'foucault-lyon-chomsky', 'implemented', 'politicalPhilosophyService'),
  C('politics.liberalism', 'Libéralisme : neutralité, pluralisme et tolérance', 'politics', 'locke-mill-rawls', 'implemented', 'politicalPhilosophyService'),
  C('politics.conservatism', 'Conservatisme : tradition et ordre organique', 'politics', 'burke', 'implemented', 'politicalPhilosophyService'),
  C('politics.socialism-marxism', 'Socialisme et marxisme', 'politics', 'marx', 'implemented', 'politicalPhilosophyService'),
  C('politics.feminism', 'Féminisme : intersectionnalité, consentement et justice reproductive', 'politics', 'feminist-political-theory', 'implemented', 'politicalPhilosophyService'),
];

const CORE_IDS = new Set(CORE_DEFINITIONS.map((concept) => concept.id));
const LEGACY_DEFINITIONS = RAW_CONCEPT_DEFINITIONS.filter((concept) => !CORE_IDS.has(concept.id));
const CONCEPT_DEFINITIONS = Object.freeze([
  ...CORE_DEFINITIONS,
  ...LEGACY_DEFINITIONS,
  ...AESTHETICS_DEFINITIONS,
]);

module.exports = {
  CONCEPT_DEFINITIONS,
  CORE_DEFINITIONS,
  LEGACY_DEFINITIONS,
  AESTHETICS_DEFINITIONS,
  FAMILY_BY_DOMAIN,
};
