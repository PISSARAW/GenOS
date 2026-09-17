'use strict';

/**
 * Canonical philosophical vocabulary.
 *
 * This file is declarative on purpose: it records what GenOS knows about a
 * concept without pretending that every concept is an executable capability.
 */

const C = (id, ...fields) => {
  const [label, domain, school, status, service = null] = fields;
  return { id, label, domain, school, status, service };
};

const CONCEPT_DEFINITIONS = [
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
  C('causality.hume-regularity', 'Loi et régularité causationnelles : Hume', 'causality', 'hume', 'partial', 'causalityService'),
  C('causality.counterfactuals', 'Conditionnels contrefactuels', 'causality', 'lewis', 'planned'),
  C('causality.determinism-indeterminism', 'Déterminisme / Indéterminisme', 'causality', 'metaphysics', 'partial', 'causalityService'),
  C('causality.fatalism', 'Fatalisme', 'causality', 'stoicism', 'implemented', 'stoicismService'),
  C('causality.free-will', 'Libre arbitre, compatibilisme, incompatibilisme, libertarianisme', 'causality', 'analytic', 'planned'),

  C('time.newtonian', 'Temps absolu et espace absolu', 'time-space', 'newton', 'implemented', 'newtonianService'),
  C('time.duration', 'Temps et durée', 'time-space', 'bergson-mctaggart', 'implemented', 'bergsonService'),
  C('time.a-series-b-series', 'A-series / B-series', 'time-space', 'mctaggart', 'implemented', 'temporalIdentityService'),
  C('time.block-universe', 'Bloc univers : éternalisme / présentisme', 'time-space', 'contemporary', 'planned'),
  C('time.arrow', 'Flèche du temps / asymétrie temporelle', 'time-space', 'physics', 'planned'),
  C('time.spacetime-relativity', 'Espace-temps relativiste', 'time-space', 'einstein', 'planned'),

  C('process.actuality-potentiality', 'Actualité / Potentialité', 'process', 'whitehead-aristotle', 'implemented', 'processPhilosophyService'),
  C('process.bergsonian-vital-impulse', 'Durée / Élan vital / Intuition', 'process', 'bergson', 'implemented', 'bergsonService'),
  C('process.heidegger-dasein', 'Sein / Dasein / Être-et-Temps', 'process', 'heidegger', 'implemented', 'processPhilosophyService'),
  C('process.deleuze-difference', 'Différence / Répétition / Rhizome', 'process', 'deleuze', 'implemented', 'processPhilosophyService'),
  C('process.badiou-event', 'Événement / Vérité', 'process', 'badiou', 'implemented', 'contingencyService'),
  C('process.sartrean-existence', 'Existence précède essence / mauvaise foi', 'process', 'sartre', 'implemented', 'phenomenologyService'),

  // Épistémologie — nature, portée et formes du savoir.
  C('epistemology.knowledge', 'Savoir / Knowledge', 'epistemology', 'general', 'partial', 'epistemics'),
  C('epistemology.tripartite-definition', 'Définition tripartite : croyance vraie justifiée', 'epistemology', 'plato-gettier', 'planned'),
  C('epistemology.gettier-problem', 'Problème de Gettier et contre-exemples', 'epistemology', 'gettier', 'planned'),
  C('epistemology.post-gettier-defenses', 'Défenses post-Gettier', 'epistemology', 'contemporary', 'planned'),
  C('epistemology.belief', 'Croyance / Belief', 'epistemology', 'general', 'partial', 'epistemics'),
  C('epistemology.justification', 'Justification épistémique', 'epistemology', 'analytic', 'partial', 'epistemics'),
  C('epistemology.truth', 'Vérité et connaissance', 'epistemology', 'general', 'partial', 'epistemics'),
  C('epistemology.plausibility', 'Vraisemblance / Probabilisme', 'epistemology', 'probabilism', 'partial', 'epistemics'),
  C('epistemology.certainty-doubt', 'Certitude / Doute', 'epistemology', 'general', 'planned'),
  C('epistemology.doxa', 'Opinion / Doxa', 'epistemology', 'plato', 'planned'),
  C('epistemology.propositional-knowledge', 'Connaissance propositionnelle', 'epistemology', 'russell', 'planned'),
  C('epistemology.acquaintance', 'Connaissance par acquaintance', 'epistemology', 'russell', 'planned'),
  C('epistemology.know-how', 'Connaissance pratique / Savoir-faire', 'epistemology', 'ryle', 'planned'),
  C('epistemology.knowledge-wh', 'Connaissance de type knowledge-wh', 'epistemology', 'contemporary', 'planned'),
  C('epistemology.gettierized-knowledge', 'Connaissance gettierisée', 'epistemology', 'gettier', 'planned'),
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
  C('method.induction', 'Induction', 'methods', 'hume', 'planned'),
  C('method.induction-problem', 'Problème de l’induction', 'methods', 'hume-wittgenstein', 'planned'),
  C('method.deduction', 'Déduction et logique déductive', 'methods', 'logic', 'planned'),
  C('method.abduction', 'Abduction', 'methods', 'peirce', 'planned'),
  C('method.inference-best-explanation', 'Inférence à la meilleure explication', 'methods', 'peirce', 'planned'),
  C('method.hypothetico-deductive', 'Méthode hypothético-déductive', 'methods', 'science-method', 'planned'),
  C('method.surprise-predictivism', 'Surprise et predictivism', 'methods', 'predictivism', 'planned'),
  C('method.dutch-book', 'Arguments Dutch book et cohérence', 'methods', 'ramsey-de-finetti', 'planned'),
  C('method.bayesianism', 'Bayésianisme et règle de Bayes', 'methods', 'bayes', 'partial', 'epistemics'),
  C('method.objective-subjective-probability', 'Probabilisme objectif / subjectif', 'methods', 'probabilism', 'partial', 'epistemics'),
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
];

module.exports = { CONCEPT_DEFINITIONS };
