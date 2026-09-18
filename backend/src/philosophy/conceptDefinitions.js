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
  mathematics: 'philosophy-of-mathematics',
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
const { LOGIC_DEFINITIONS } = require('./logicDefinitions');
const { MATHEMATICS_DEFINITIONS } = require('./mathematicsDefinitions');

const C = ({ id, label, domain, school, status, service = null, metadata = {} }) => {
  return {
    id, label, domain, school, status, service,
    family: metadata.family || FAMILY_BY_DOMAIN[domain] || domain,
    ...metadata,
  };
};

const RAW_CONCEPT_DEFINITIONS = [
  C({ id: 'ontology.being', label: 'Être / Being / ensoma', domain: 'ontology', school: 'general', status: 'implemented', service: 'ontologyCore' }),
  C({ id: 'ontology.substance', label: 'Substance / Sostanza', domain: 'ontology', school: 'aristotle-spinoza-descartes', status: 'implemented', service: 'substanceService' }),
  C({ id: 'ontology.attribute', label: 'Attribut / Propriété', domain: 'ontology', school: 'general', status: 'implemented', service: 'ontologyAttributes' }),
  C({ id: 'ontology.mode', label: 'Mode / Modalité', domain: 'ontology', school: 'general', status: 'implemented', service: 'ontologyModes' }),
  C({ id: 'ontology.essence-accident', label: 'Essentia / Accident', domain: 'ontology', school: 'aristotle-scholastic', status: 'implemented', service: 'ontologyAttributes' }),
  C({ id: 'ontology.hypostatization', label: 'Hypostatisation', domain: 'ontology', school: 'scholastic', status: 'implemented', service: 'ontologyHypostatization' }),
  C({ id: 'ontology.stances', label: 'Réalisme / Nominalisme / Conceptualisme', domain: 'ontology', school: 'medieval-modern', status: 'implemented', service: 'ontologyStances' }),
  C({ id: 'ontology.identity-change', label: 'Identité et changement', domain: 'ontology', school: 'locke', status: 'implemented', service: 'temporalIdentityService' }),
  C({ id: 'ontology.person-other', label: 'Personne / Autrui / Altérité', domain: 'ontology', school: 'levinas', status: 'partial', service: 'personOtherService' }),
  C({ id: 'ontology.whole-void-infinite', label: 'Tout / Vide / Infini', domain: 'ontology', school: 'metaphysics', status: 'partial' }),
  C({ id: 'ontology.continuous-discrete', label: 'Continu / Discontinu', domain: 'ontology', school: 'metaphysics', status: 'partial', service: 'continuityService' }),
  C({ id: 'ontology.possible-worlds', label: 'Mondes possibles / Possibilia', domain: 'modality', school: 'leibniz-kripke', status: 'partial', service: 'possibleWorldService' }),
  C({ id: 'ontology.contingency-necessity', label: 'Contingence / Nécessité logique et métaphysique', domain: 'modality', school: 'modal-metaphysics', status: 'partial', service: 'contingencyService' }),

  C({ id: 'school.platonism', label: 'Platonisme : formes idéales', domain: 'schools', school: 'plato', status: 'implemented', service: 'platonismService' }),
  C({ id: 'school.aristotelianism', label: 'Aristotélisme : catégories et causes', domain: 'schools', school: 'aristotle', status: 'implemented', service: 'aristotelianService' }),
  C({ id: 'school.stoicism', label: 'Stoïcisme : monisme, logos, fate', domain: 'schools', school: 'stoicism', status: 'implemented', service: 'stoicismService' }),
  C({ id: 'school.epicureanism', label: 'Épicurisme : atomes, vide, sensations', domain: 'schools', school: 'epicurus', status: 'implemented', service: 'epicureanService' }),
  C({ id: 'school.scholasticism', label: 'Scholastique : équivocité, analogie, univocité', domain: 'schools', school: 'scholastic', status: 'implemented', service: 'scholastiqueService' }),
  C({ id: 'school.cartesianism', label: 'Cartesianisme : res cogitans / res extensa', domain: 'schools', school: 'descartes', status: 'implemented', service: 'cartesianService' }),
  C({ id: 'school.leibnizianism', label: 'Leibniz : monades et harmonie préétablie', domain: 'schools', school: 'leibniz', status: 'implemented', service: 'leibnizianService' }),
  C({ id: 'school.spinozism', label: 'Spinozisme : Deus sive Natura et conatus', domain: 'schools', school: 'spinoza', status: 'implemented', service: 'spinozaService' }),
  C({ id: 'school.newtonianism', label: 'Newton : espace et temps absolus', domain: 'schools', school: 'newton', status: 'implemented', service: 'newtonianService' }),
  C({ id: 'school.kantianism', label: 'Kant : noumène, phénomène, catégories a priori', domain: 'schools', school: 'kant', status: 'implemented', service: 'kantianService' }),
  C({ id: 'school.hegelianism', label: 'Hegel : dialectique et Absolute Geist', domain: 'schools', school: 'hegel', status: 'implemented', service: 'hegelianService' }),
  C({ id: 'school.schopenhauer', label: 'Schopenhauer : volonté et représentation', domain: 'schools', school: 'schopenhauer', status: 'implemented', service: 'schopenhauerService' }),
  C({ id: 'school.nietzsche', label: 'Nietzsche : volonté de puissance et éternel retour', domain: 'schools', school: 'nietzsche', status: 'implemented', service: 'nietzscheService' }),
  C({ id: 'school.bergsonism', label: 'Bergson : durée, élan vital, intuition', domain: 'schools', school: 'bergson', status: 'implemented', service: 'bergsonService' }),
  C({ id: 'school.whitehead', label: 'Whitehead : processus, actualité, potentialité', domain: 'schools', school: 'whitehead', status: 'implemented', service: 'processPhilosophyService' }),
  C({ id: 'school.heidegger', label: 'Heidegger : Être-et-Temps, Sein, Dasein', domain: 'schools', school: 'heidegger', status: 'implemented', service: 'processPhilosophyService' }),
  C({ id: 'school.sartre', label: 'Sartre : existence, essence, mauvaise foi', domain: 'schools', school: 'sartre', status: 'implemented', service: 'phenomenologyService' }),
  C({ id: 'school.merleau-ponty', label: 'Merleau-Ponty : phénoménologie de la perception', domain: 'schools', school: 'merleau-ponty', status: 'implemented', service: 'phenomenologyService' }),
  C({ id: 'school.deleuze', label: 'Deleuze : différence, répétition, rhizome', domain: 'schools', school: 'deleuze', status: 'implemented', service: 'processPhilosophyService' }),
  C({ id: 'school.badiou', label: 'Badiou : événement, vérité, mathématiques de l’être', domain: 'schools', school: 'badiou', status: 'implemented', service: 'contingencyService' }),
  C({ id: 'school.meillassoux', label: 'Meillassoux : contingence absolue', domain: 'schools', school: 'meillassoux', status: 'implemented', service: 'contingencyService' }),
  C({ id: 'school.speculative-realism', label: 'Réalisme spéculatif : corrélationisme, accessibilité', domain: 'schools', school: 'speculative-realism', status: 'partial', service: 'speculativeRealismService' }),

  C({ id: 'metaphysics.monism-idealism', label: 'Monisme idéaliste', domain: 'metaphysics', school: 'berkeley-hegel', status: 'partial', service: 'metaphysicsService' }),
  C({ id: 'metaphysics.dualism', label: 'Dualisme des substances', domain: 'metaphysics', school: 'descartes', status: 'implemented', service: 'cartesianService' }),
  C({ id: 'metaphysics.material-monism', label: 'Monisme matériel / Physicalisme', domain: 'metaphysics', school: 'physicalism', status: 'partial', service: 'propertyService' }),
  C({ id: 'metaphysics.panpsychism', label: 'Panpsychisme / Panexperientialisme', domain: 'metaphysics', school: 'contemporary', status: 'partial', service: 'metaphysicsService' }),
  C({ id: 'metaphysics.eliminativism', label: 'Éliminativisme matérialiste', domain: 'metaphysics', school: 'churchland', status: 'partial', service: 'metaphysicsService' }),
  C({ id: 'metaphysics.reductionism', label: 'Réductionnisme', domain: 'metaphysics', school: 'analytic', status: 'partial', service: 'propertyService' }),
  C({ id: 'metaphysics.emergence', label: 'Émergence / propriété émergente', domain: 'metaphysics', school: 'analytic', status: 'implemented', service: 'propertyService' }),
  C({ id: 'metaphysics.supervenience', label: 'Supervenience / supervenience psychophysique', domain: 'metaphysics', school: 'analytic', status: 'implemented', service: 'propertyService' }),
  C({ id: 'metaphysics.second-order-properties', label: 'Propriétés de deuxième ordre', domain: 'metaphysics', school: 'analytic', status: 'partial', service: 'metaphysicsService' }),
  C({ id: 'metaphysics.mind-body', label: 'Matière, esprit, conscience et problème corps-esprit', domain: 'metaphysics', school: 'mind-body', status: 'partial', service: 'consciousnessService' }),
  C({ id: 'metaphysics.qualia', label: 'Qualia', domain: 'phenomenology', school: 'contemporary', status: 'implemented', service: 'consciousnessService' }),
  C({ id: 'metaphysics.cartesian-pineal', label: 'Épine / glande pinéale de Descartes', domain: 'metaphysics', school: 'descartes', status: 'implemented', service: 'cartesianService' }),
  C({ id: 'metaphysics.reference-intentionality', label: 'Référence et intentionnalité', domain: 'phenomenology', school: 'brentano-husserl', status: 'implemented', service: 'phenomenologyService' }),

  C({ id: 'causality.determination', label: 'Détermination / Causalité', domain: 'causality', school: 'general', status: 'implemented', service: 'causalityService' }),
  C({ id: 'causality.hume-regularity', label: 'Loi et régularité causationnelles : Hume', domain: 'causality', school: 'hume', status: 'implemented', service: 'causalityService' }),
  C({ id: 'causality.counterfactuals', label: 'Conditionnels contrefactuels', domain: 'causality', school: 'lewis', status: 'implemented', service: 'causalityService' }),
  C({ id: 'causality.determinism-indeterminism', label: 'Déterminisme / Indéterminisme', domain: 'causality', school: 'metaphysics', status: 'implemented', service: 'causalityService' }),
  C({ id: 'causality.fatalism', label: 'Fatalisme', domain: 'causality', school: 'stoicism', status: 'implemented', service: 'stoicismService' }),
  C({ id: 'causality.free-will', label: 'Libre arbitre, compatibilisme, incompatibilisme, libertarianisme', domain: 'causality', school: 'analytic', status: 'implemented', service: 'causalityService' }),

  C({ id: 'time.newtonian', label: 'Temps absolu et espace absolu', domain: 'time-space', school: 'newton', status: 'implemented', service: 'newtonianService' }),
  C({ id: 'time.duration', label: 'Temps et durée', domain: 'time-space', school: 'bergson-mctaggart', status: 'implemented', service: 'bergsonService' }),
  C({ id: 'time.a-series-b-series', label: 'A-series / B-series', domain: 'time-space', school: 'mctaggart', status: 'implemented', service: 'temporalIdentityService' }),
  C({ id: 'time.block-universe', label: 'Bloc univers : éternalisme / présentisme', domain: 'time-space', school: 'contemporary', status: 'implemented', service: 'temporalIdentityService' }),
  C({ id: 'time.arrow', label: 'Flèche du temps / asymétrie temporelle', domain: 'time-space', school: 'physics', status: 'implemented', service: 'temporalIdentityService' }),
  C({ id: 'time.spacetime-relativity', label: 'Espace-temps relativiste', domain: 'time-space', school: 'einstein', status: 'implemented', service: 'temporalIdentityService' }),

  C({ id: 'process.actuality-potentiality', label: 'Actualité / Potentialité', domain: 'process', school: 'whitehead-aristotle', status: 'implemented', service: 'processPhilosophyService' }),
  C({ id: 'process.bergsonian-vital-impulse', label: 'Durée / Élan vital / Intuition', domain: 'process', school: 'bergson', status: 'implemented', service: 'bergsonService' }),
  C({ id: 'process.heidegger-dasein', label: 'Sein / Dasein / Être-et-Temps', domain: 'process', school: 'heidegger', status: 'implemented', service: 'processPhilosophyService' }),
  C({ id: 'process.deleuze-difference', label: 'Différence / Répétition / Rhizome', domain: 'process', school: 'deleuze', status: 'implemented', service: 'processPhilosophyService' }),
  C({ id: 'process.badiou-event', label: 'Événement / Vérité', domain: 'process', school: 'badiou', status: 'implemented', service: 'contingencyService' }),
  C({ id: 'process.sartrean-existence', label: 'Existence précède essence / mauvaise foi', domain: 'process', school: 'sartre', status: 'implemented', service: 'phenomenologyService' }),

  // Épistémologie — nature, portée et formes du savoir.
  C({ id: 'epistemology.knowledge', label: 'Savoir / Knowledge', domain: 'epistemology', school: 'general', status: 'partial', service: 'epistemics' }),
  C({ id: 'epistemology.tripartite-definition', label: 'Définition tripartite : croyance vraie justifiée', domain: 'epistemology', school: 'plato-gettier', status: 'planned' }),
  C({ id: 'epistemology.gettier-problem', label: 'Problème de Gettier et contre-exemples', domain: 'epistemology', school: 'gettier', status: 'partial', service: 'knowledgeService' }),
  C({ id: 'epistemology.post-gettier-defenses', label: 'Défenses post-Gettier', domain: 'epistemology', school: 'contemporary', status: 'partial', service: 'knowledgeService' }),
  C({ id: 'epistemology.belief', label: 'Croyance / Belief', domain: 'epistemology', school: 'general', status: 'partial', service: 'epistemics' }),
  C({ id: 'epistemology.justification', label: 'Justification épistémique', domain: 'epistemology', school: 'analytic', status: 'partial', service: 'epistemics' }),
  C({ id: 'epistemology.truth', label: 'Vérité et connaissance', domain: 'epistemology', school: 'general', status: 'partial', service: 'epistemics' }),
  C({ id: 'epistemology.plausibility', label: 'Vraisemblance / Probabilisme', domain: 'epistemology', school: 'probabilism', status: 'partial', service: 'probabilityService' }),
  C({ id: 'epistemology.certainty-doubt', label: 'Certitude / Doute', domain: 'epistemology', school: 'general', status: 'planned' }),
  C({ id: 'epistemology.doxa', label: 'Opinion / Doxa', domain: 'epistemology', school: 'plato', status: 'planned' }),
  C({ id: 'epistemology.propositional-knowledge', label: 'Connaissance propositionnelle', domain: 'epistemology', school: 'russell', status: 'planned' }),
  C({ id: 'epistemology.acquaintance', label: 'Connaissance par acquaintance', domain: 'epistemology', school: 'russell', status: 'planned' }),
  C({ id: 'epistemology.know-how', label: 'Connaissance pratique / Savoir-faire', domain: 'epistemology', school: 'ryle', status: 'planned' }),
  C({ id: 'epistemology.knowledge-wh', label: 'Connaissance de type knowledge-wh', domain: 'epistemology', school: 'contemporary', status: 'planned' }),
  C({ id: 'epistemology.gettierized-knowledge', label: 'Connaissance gettierisée', domain: 'epistemology', school: 'gettier', status: 'partial', service: 'knowledgeService' }),
  C({ id: 'epistemology.knowledge-first', label: 'Knowledge-first epistemology', domain: 'epistemology', school: 'williamson', status: 'planned' }),
  C({ id: 'epistemology.knowledge-assertion', label: 'Knowledge account of assertion', domain: 'epistemology', school: 'williamson-turri', status: 'planned' }),
  C({ id: 'epistemology.rationality-norms', label: 'Rationalité et normes de croyance', domain: 'epistemology', school: 'analytic', status: 'partial', service: 'epistemics' }),
  C({ id: 'epistemology.context-discovery-justification', label: 'Contexte de découverte / justification', domain: 'epistemology', school: 'reichenbach', status: 'planned' }),

  // Écoles et positions épistémologiques.
  C({ id: 'school.empiricism', label: 'Empirisme : Locke, Berkeley, Hume', domain: 'schools', school: 'locke-berkeley-hume', status: 'planned' }),
  C({ id: 'school.rationalism', label: 'Rationalisme : Descartes, Spinoza, Leibniz', domain: 'schools', school: 'descartes-spinoza-leibniz', status: 'partial', service: 'epistemologyService' }),
  C({ id: 'school.verificationism', label: 'Vérificationnisme et positivisme logique', domain: 'schools', school: 'vienna-circle', status: 'planned' }),
  C({ id: 'school.falsificationism', label: 'Falsificationnisme', domain: 'schools', school: 'popper', status: 'planned' }),
  C({ id: 'school.pragmatism', label: 'Pragmatisme : Peirce, James, Dewey, Rorty', domain: 'schools', school: 'pragmatism', status: 'planned' }),
  C({ id: 'school.feminist-epistemology', label: 'Épistémologie féministe', domain: 'schools', school: 'feminist-epistemology', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'school.social-epistemology', label: 'Épistémologie sociale', domain: 'schools', school: 'social-epistemology', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'school.naturalized-epistemology', label: 'Épistémologie naturalisée', domain: 'schools', school: 'quine-neurath', status: 'planned' }),
  C({ id: 'school.standpoint-theory', label: 'Standpoint theory', domain: 'schools', school: 'hartsock-harding', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'school.situated-knowledges', label: 'Savoirs situés / Situated knowledges', domain: 'schools', school: 'haraway', status: 'partial', service: 'socialEpistemologyService' }),

  // Raisonnement et méthode.
  C({ id: 'method.induction', label: 'Induction', domain: 'methods', school: 'hume', status: 'partial', service: 'inferenceService' }),
  C({ id: 'method.induction-problem', label: 'Problème de l’induction', domain: 'methods', school: 'hume-wittgenstein', status: 'planned' }),
  C({ id: 'method.deduction', label: 'Déduction et logique déductive', domain: 'methods', school: 'logic', status: 'partial', service: 'inferenceService' }),
  C({ id: 'method.abduction', label: 'Abduction', domain: 'methods', school: 'peirce', status: 'partial', service: 'inferenceService' }),
  C({ id: 'method.inference-best-explanation', label: 'Inférence à la meilleure explication', domain: 'methods', school: 'peirce', status: 'partial', service: 'inferenceService' }),
  C({ id: 'method.hypothetico-deductive', label: 'Méthode hypothético-déductive', domain: 'methods', school: 'science-method', status: 'partial', service: 'scientificMethodService' }),
  C({ id: 'method.surprise-predictivism', label: 'Surprise et predictivism', domain: 'methods', school: 'predictivism', status: 'planned' }),
  C({ id: 'method.dutch-book', label: 'Arguments Dutch book et cohérence', domain: 'methods', school: 'ramsey-de-finetti', status: 'planned' }),
  C({ id: 'method.bayesianism', label: 'Bayésianisme et règle de Bayes', domain: 'methods', school: 'bayes', status: 'partial', service: 'probabilityService' }),
  C({ id: 'method.objective-subjective-probability', label: 'Probabilisme objectif / subjectif', domain: 'methods', school: 'probabilism', status: 'partial', service: 'probabilityService' }),
  C({ id: 'method.bayesian-confirmation', label: 'Confirmation bayésienne', domain: 'methods', school: 'carnap-hempel', status: 'planned' }),

  // Science, confirmation et changement théorique.
  C({ id: 'science.confirmation', label: 'Théorie de la confirmation', domain: 'science', school: 'carnap-hempel', status: 'partial', service: 'scientificMethodService' }),
  C({ id: 'science.raven-paradox', label: 'Paradoxe des corbeaux', domain: 'science', school: 'hempel', status: 'planned' }),
  C({ id: 'science.duhem-quine', label: 'Thèse de Duhem-Quine et holisme épistémique', domain: 'science', school: 'duhem-quine', status: 'partial', service: 'scientificMethodService' }),
  C({ id: 'science.falsification-demarcation', label: 'Falsification et problème de la démarcation', domain: 'science', school: 'popper', status: 'partial', service: 'scientificMethodService' }),
  C({ id: 'science.progress', label: 'Progrès de la science et programmes de recherche', domain: 'science', school: 'lakatos', status: 'planned' }),
  C({ id: 'science.paradigm-incommensurability', label: 'Changements de paradigmes et incommensurabilité', domain: 'science', school: 'kuhn', status: 'planned' }),
  C({ id: 'science.normal-revolutionary', label: 'Science normale et révolutionnaire', domain: 'science', school: 'kuhn', status: 'planned' }),
  C({ id: 'science.godel-incompleteness', label: 'Théorèmes d’incomplétude et limites formelles', domain: 'science', school: 'godel', status: 'planned' }),

  // Théories de la vérité.
  C({ id: 'truth.correspondence', label: 'Théorie de la correspondance', domain: 'truth', school: 'russell-early-wittgenstein', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'truth.coherence', label: 'Théorie de la cohérence', domain: 'truth', school: 'hegel-bradley-neurath', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'truth.pragmatist', label: 'Théorie pragmatiste de la vérité', domain: 'truth', school: 'peirce-james-dewey-rorty', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'truth.deflationary', label: 'Théories déflationnistes de la vérité', domain: 'truth', school: 'ramsey-strawson-horwich', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'truth.minimalism', label: 'Vérité minimaliste / minimalisme', domain: 'truth', school: 'horwich', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'truth.internal-realism', label: 'Vérité et conséquences / réalisme interne', domain: 'truth', school: 'putnam', status: 'partial', service: 'truthSkepticismService' }),

  // Fiabilité, scepticisme et limites de la connaissance.
  C({ id: 'epistemology.reliabilism', label: 'Fiabilité cognitive / Reliabilisme', domain: 'epistemology', school: 'goldman', status: 'partial', service: 'reliabilityService' }),
  C({ id: 'epistemology.process-reliabilism', label: 'Process reliabilism', domain: 'epistemology', school: 'goldman', status: 'planned' }),
  C({ id: 'epistemology.indicator-reliabilism', label: 'Indicator reliabilism', domain: 'epistemology', school: 'reliabilism', status: 'planned' }),
  C({ id: 'epistemology.virtue-epistemology', label: 'Virtue epistemology', domain: 'epistemology', school: 'zagzebski-sosa', status: 'planned' }),
  C({ id: 'epistemology.intellectual-virtue-vice', label: 'Vertu / vice intellectuel', domain: 'epistemology', school: 'virtue-epistemology', status: 'planned' }),
  C({ id: 'epistemology.causal-theory-knowledge', label: 'Théorie causale de la connaissance', domain: 'epistemology', school: 'causal-epistemology', status: 'planned' }),
  C({ id: 'epistemology.relativism', label: 'Relativisme épistémique et culturel', domain: 'epistemology', school: 'relativism', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'epistemology.skepticism', label: 'Scepticisme : Pyrrhon, Académiciens, Montaigne, Hume', domain: 'epistemology', school: 'skepticism', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'epistemology.radical-skepticism', label: 'Scepticisme radical', domain: 'epistemology', school: 'contemporary', status: 'partial', service: 'truthSkepticismService' }),
  C({ id: 'epistemology.cartesian-doubt', label: 'Doute cartésien / doute méthodique', domain: 'epistemology', school: 'descartes', status: 'partial', service: 'cartesianService' }),

  // Épistémologie sociale, féministe et critique.
  C({ id: 'social-epistemology.testimony', label: 'Témoignage et transmission du savoir', domain: 'social-epistemology', school: 'testimony', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'social-epistemology.discussion', label: 'Discussion, désaccord et épistémologie sociale', domain: 'social-epistemology', school: 'social-epistemology', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'social-epistemology.cognitive-labor', label: 'Division du travail cognitif', domain: 'social-epistemology', school: 'social-epistemology', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'social-epistemology.feminist', label: 'Épistémologie féministe et critique des savoirs', domain: 'social-epistemology', school: 'feminist-epistemology', status: 'partial', service: 'socialEpistemologyService' }),
  C({ id: 'social-epistemology.emancipatory-critique', label: 'Émancipation épistémique et critique', domain: 'social-epistemology', school: 'frankfurt-school', status: 'partial', service: 'socialEpistemologyService' }),

  // Éthique normative — noyau évaluatif sans autorisation d'exécution.
  C({ id: 'ethics.consequentialism', label: 'Conséquentialisme', domain: 'normative-ethics', school: 'contemporary', status: 'partial', service: 'normativeEthicsService' }),
  C({ id: 'ethics.utilitarianism', label: 'Utilitarisme', domain: 'normative-ethics', school: 'bentham-mill-singer', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.act-utilitarianism', label: 'Utilitarisme de l’acte', domain: 'normative-ethics', school: 'bentham-singer', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.rule-utilitarianism', label: 'Utilitarisme de la règle', domain: 'normative-ethics', school: 'mill', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.hedonism', label: 'Hédonisme, plaisir et utilité', domain: 'normative-ethics', school: 'epicurus-bentham', status: 'partial', service: 'normativeEthicsService' }),
  C({ id: 'ethics.deontology', label: 'Déontologie', domain: 'normative-ethics', school: 'kant', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.categorical-imperative', label: 'Impératif catégorique', domain: 'normative-ethics', school: 'kant', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.double-effect', label: 'Doctrine du double effet', domain: 'normative-ethics', school: 'aquinas', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.virtue-ethics', label: 'Éthique des vertus', domain: 'normative-ethics', school: 'aristotle', status: 'implemented', service: 'normativeEthicsService' }),
  C({ id: 'ethics.social-contract', label: 'État de nature et contrat social', domain: 'normative-ethics', school: 'hobbes-locke-rousseau', status: 'implemented', service: 'justiceEthicsService' }),
  C({ id: 'ethics.natural-rights', label: 'Droits naturels et droits humains', domain: 'normative-ethics', school: 'locke', status: 'implemented', service: 'justiceEthicsService' }),
  C({ id: 'ethics.contractarianism', label: 'Contractarianisme', domain: 'normative-ethics', school: 'rawls-scanlon-gauthier', status: 'partial', service: 'justiceEthicsService' }),
  C({ id: 'ethics.rawlsian-justice', label: 'Justice comme équité', domain: 'normative-ethics', school: 'rawls', status: 'implemented', service: 'justiceEthicsService' }),
  C({ id: 'ethics.distributive-justice', label: 'Justice distributive', domain: 'normative-ethics', school: 'contemporary', status: 'implemented', service: 'justiceEthicsService' }),
  C({ id: 'ethics.libertarianism', label: 'Libertarianisme et entitlement theory', domain: 'normative-ethics', school: 'nozick', status: 'implemented', service: 'justiceEthicsService' }),
  C({ id: 'ethics.equality-of-opportunity', label: 'Égalité des chances', domain: 'normative-ethics', school: 'political-philosophy', status: 'partial', service: 'justiceEthicsService' }),
  C({ id: 'ethics.retributive-restorative-justice', label: 'Justice rétributive et réparatrice', domain: 'normative-ethics', school: 'contemporary', status: 'partial', service: 'justiceEthicsService' }),
  C({ id: 'ethics.care-ethics', label: 'Éthique du care', domain: 'normative-ethics', school: 'gilligan-noddings-tronto', status: 'implemented', service: 'relationalEthicsService' }),
  C({ id: 'ethics.care-deontology', label: 'Éthique déontologique du care', domain: 'normative-ethics', school: 'care-ethics', status: 'implemented', service: 'relationalEthicsService' }),
  C({ id: 'ethics.responsibility-other', label: 'Responsabilité et autrui', domain: 'normative-ethics', school: 'levinas', status: 'implemented', service: 'relationalEthicsService' }),

  // Philosophie politique — noyau analytique sans autorisation d'exécution.
  C({ id: 'politics.regime-classification', label: 'Régimes politiques : démocratie, autoritarisme, dictature', domain: 'politics', school: 'weber-dahl', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.legitimacy', label: 'État, souveraineté et légitimité', domain: 'politics', school: 'weber-bodin-hobbes', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.social-contract', label: 'Contrat social', domain: 'politics', school: 'hobbes-locke-rousseau-kant', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.liberty-authority', label: 'Liberté et autorité', domain: 'politics', school: 'political-philosophy', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.separation-of-powers', label: 'Séparation des pouvoirs', domain: 'politics', school: 'montesquieu', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.democratic-participation', label: 'Démocratie directe, représentative et délibérative', domain: 'politics', school: 'habermas-rawls', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.pluralism', label: 'Pluralisme politique', domain: 'politics', school: 'dahl', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.civil-disobedience', label: 'Désobéissance civile', domain: 'politics', school: 'thoreau-gandhi-mlk-arendt-rawls', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.security-liberty-surveillance', label: 'Sécurité, liberté et surveillance', domain: 'politics', school: 'foucault-lyon-chomsky', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.liberalism', label: 'Libéralisme : neutralité, pluralisme et tolérance', domain: 'politics', school: 'locke-mill-rawls', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.conservatism', label: 'Conservatisme : tradition et ordre organique', domain: 'politics', school: 'burke', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.socialism-marxism', label: 'Socialisme et marxisme', domain: 'politics', school: 'marx', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'politics.feminism', label: 'Féminisme : intersectionnalité, consentement et justice reproductive', domain: 'politics', school: 'feminist-political-theory', status: 'implemented', service: 'politicalPhilosophyService' }),
  C({ id: 'ethics.environmental-ethics', label: 'Éthique environnementale : écocentrisme, biocentrisme et anthropocentrisme critique', domain: 'normative-ethics', school: 'naess', status: 'implemented', service: 'environmentalEthicsService' }),
  C({ id: 'ethics.animal-rights', label: 'Droits des animaux et êtres sentients', domain: 'normative-ethics', school: 'regan-singer', status: 'implemented', service: 'environmentalEthicsService' }),
  C({ id: 'ethics.sustainability', label: 'Durabilité et stewardship', domain: 'normative-ethics', school: 'environmental-ethics', status: 'implemented', service: 'environmentalEthicsService' }),
  C({ id: 'ethics.precautionary-principle', label: 'Principe de précaution', domain: 'normative-ethics', school: 'environmental-ethics', status: 'implemented', service: 'environmentalEthicsService' }),
  C({ id: 'ethics.externalities', label: 'Externalités et défaillances de marché', domain: 'normative-ethics', school: 'economics', status: 'implemented', service: 'environmentalEthicsService' }),
  C({ id: 'ethics.commons', label: 'Tragédie des communs', domain: 'normative-ethics', school: 'hardin-ostrom', status: 'implemented', service: 'environmentalEthicsService' }),
];

const CORE_IDS = new Set(CORE_DEFINITIONS.map((concept) => concept.id));
const LEGACY_DEFINITIONS = RAW_CONCEPT_DEFINITIONS.filter((concept) => !CORE_IDS.has(concept.id));
const CONCEPT_DEFINITIONS = Object.freeze([
  ...CORE_DEFINITIONS,
  ...LEGACY_DEFINITIONS,
  ...AESTHETICS_DEFINITIONS,
  ...LOGIC_DEFINITIONS,
  ...MATHEMATICS_DEFINITIONS,
]);

module.exports = {
  CONCEPT_DEFINITIONS,
  CORE_DEFINITIONS,
  LEGACY_DEFINITIONS,
  AESTHETICS_DEFINITIONS,
  LOGIC_DEFINITIONS,
  MATHEMATICS_DEFINITIONS,
  FAMILY_BY_DOMAIN,
};
