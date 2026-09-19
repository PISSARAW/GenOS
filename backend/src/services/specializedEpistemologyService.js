'use strict';

const { boundedAnalysis, withEpistemicContext } = require('./philosophyAnalysisContract');

const RUBRICS = Object.freeze({
  'epistemology.tripartite-definition': ['belief', 'truth', 'justification'],
  'epistemology.certainty-doubt': ['grounds', 'defeaters', 'scope'],
  'epistemology.doxa': ['belief', 'truth', 'account'],
  'epistemology.propositional-knowledge': ['proposition', 'belief', 'truth', 'justification'],
  'epistemology.knowledge-first': ['knowledge-explanatory-priority', 'anti-reductive-account'],
  'epistemology.knowledge-assertion': ['knowledge-norm', 'contextual-threshold'],
  'epistemology.context-discovery-justification': ['discovery-context', 'justification-context', 'inference-separation'],
  'epistemology.acquaintance': ['direct-awareness', 'object-identified', 'description-separated'],
  'epistemology.know-how': ['practical-ability', 'reliable-performance', 'propositional-reduction'],
  'epistemology.knowledge-wh': ['question-identified', 'answer-known', 'method-or-object'],
  'epistemology.process-reliabilism': ['process-specified', 'successes', 'trials', 'reference-class'],
  'epistemology.indicator-reliabilism': ['indicator-specified', 'calibration-sample', 'base-rate'],
  'epistemology.virtue-epistemology': ['intellectual-competence', 'truth-connection', 'agent-credit'],
  'epistemology.intellectual-virtue-vice': ['trait-specified', 'truth-conducive', 'countervailing-vice'],
  'epistemology.causal-theory-knowledge': ['causal-chain', 'fact-causes-belief', 'deviant-causation-checked'],
  'method.induction-problem': ['past-regularity', 'future-projection', 'non-circular-bridge'],
  'method.surprise-predictivism': ['prediction-prior-to-data', 'surprise-measure', 'retrospective-fit-separated'],
  'method.dutch-book': ['probabilities', 'stakes', 'book-construction'],
  'method.bayesian-confirmation': ['prior', 'likelihood-under-hypothesis', 'likelihood-under-alternative'],
  'school.empiricism': ['experience-as-source', 'observation-basis', 'innateness-account'],
  'school.verificationism': ['verification-criterion', 'empirical-test', 'meaning-boundary'],
  'school.falsificationism': ['risky-prediction', 'possible-refuter', 'auxiliaries-explicit'],
  'school.pragmatism': ['practical-consequences', 'inquiry-context', 'truth-not-utility-only'],
  'school.naturalized-epistemology': ['empirical-method', 'cognitive-process', 'normative-scope'],
  'science.raven-paradox': ['hypothesis-form', 'black-raven-observed', 'non-black-non-raven-observed', 'background-knowledge'],
  'science.progress': ['research-program', 'novel-predictions', 'theory-change-comparison'],
  'science.paradigm-incommensurability': ['paradigms-specified', 'shared-standards', 'translation-limits'],
  'science.normal-revolutionary': ['puzzle-solving-phase', 'anomaly-pressure', 'framework-transition'],
  'science.godel-incompleteness': ['effective-axiomatization', 'consistent-system', 'arithmetic-expressivity', 'formal-sentence-status'],
});

function criteriaFor(conceptId, criteria) {
  if (!Array.isArray(criteria)) throw new Error('criteria must be an array of { id, supports } records.');
  const required = RUBRICS[conceptId];
  const supplied = new Map(criteria.filter((item) => item && typeof item.id === 'string')
    .map((item) => [item.id, item]));
  return required.map((id) => {
    const item = supplied.get(id);
    return { id, status: typeof item?.supports === 'boolean' ? (item.supports ? 'supports' : 'challenges') : 'unknown', evidence: item?.evidence ?? null };
  });
}

function formalLimit(args) {
  const flags = ['effectiveAxiomatization', 'consistentSystem', 'arithmeticExpressivity'];
  const established = flags.every((key) => args[key] === true);
  const missing = flags.filter((key) => args[key] !== true);
  const sentenceStatus = ['provable', 'refutable', 'neither'].includes(args.formalSentenceStatus)
    ? args.formalSentenceStatus : 'unknown';
  return {
    status: !established || sentenceStatus === 'unknown' ? 'undetermined'
      : sentenceStatus === 'neither' ? 'conditional-incompleteness-instance' : 'sentence-decidable-in-system',
    assumptions: Object.fromEntries(flags.map((key) => [key, args[key] === true])),
    missingAssumptions: missing,
    formalSentenceStatus: sentenceStatus,
    note: 'Aucune preuve n’est construite. L’analyse porte seulement sur les propriétés formelles et le statut de phrase déclarés; un système consistant et suffisamment expressif peut être incomplet sous les hypothèses du théorème.',
  };
}

function summarizeCriteria(criteria) {
  const known = criteria.filter((item) => item.status !== 'unknown');
  const supports = known.filter((item) => item.status === 'supports').length;
  const challenges = known.length - supports;
  return {
    status: known.length === 0 ? 'undetermined' : challenges === 0 ? 'supported-by-declared-criteria'
      : supports === 0 ? 'challenged-by-declared-criteria' : 'mixed-evidence',
    counts: { required: criteria.length, assessed: known.length, supports, challenges, unknown: criteria.length - known.length },
  };
}

function analyzeWithExistingService(conceptId, args) {
  if (conceptId === 'method.induction-problem') {
    return require('./inferenceService').inferInductively(args);
  }
  if (conceptId === 'method.dutch-book') {
    if (!Array.isArray(args.distribution) || args.distribution.length === 0) {
      return { kind: 'dutch-book-coherence', status: 'insufficient-data', coherent: null };
    }
    return require('./probabilityService').assessDistribution({ distribution: args.distribution });
  }
  if (conceptId === 'method.bayesian-confirmation') {
    return require('./probabilityService').bayesUpdate(args);
  }
  if (conceptId === 'epistemology.process-reliabilism') {
    if (typeof args.process !== 'string' || !args.process.trim()) {
      return { kind: 'process-reliabilism', status: 'insufficient-data', process: null };
    }
    return require('./reliabilityService').assessReliability(args);
  }
  return null;
}

function wrapped(result, methodology) {
  return withEpistemicContext(boundedAnalysis(result), {
    methodology, reasoningStatus: result.status,
  });
}

function tripartiteAnalysis(conceptId, args) {
  if (conceptId !== 'epistemology.tripartite-definition' || !args.claim) return null;
  const knowledge = require('./knowledgeService').analyzeKnowledge(args);
  return wrapped({ ...knowledge, conceptId, kind: conceptId }, 'tripartite-knowledge-assessment');
}

function rubricAnalysis(conceptId, args) {
  const formal = conceptId === 'science.godel-incompleteness';
  const criteria = formal ? [] : criteriaFor(conceptId, args.criteria ?? []);
  const assessment = formal ? formalLimit(args) : summarizeCriteria(criteria);
  return wrapped({
    kind: conceptId,
    conceptId,
    status: assessment.status,
    criteria,
    evidence: criteria.filter((item) => item.evidence !== null)
      .map((item) => ({ criterion: item.id, evidence: item.evidence })),
    ...(formal ? { formalScope: assessment } : { counts: assessment.counts }),
    provenance: { source: 'caller-supplied criteria and evidence', evidenceItems: criteria.filter((item) => item.evidence !== null).length },
    uncertainty: assessment.status === 'undetermined' || assessment.status === 'mixed-evidence'
      ? 'Les critères non évalués ou contradictoires empêchent une conclusion plus forte.'
      : 'Le résultat dépend des critères, étiquettes et éléments communiqués par l’appelant.',
    promotionEligible: false,
    limitation: 'Analyse descriptive et conditionnelle; elle ne vérifie pas les éléments déclarés et ne tranche pas à elle seule les controverses philosophiques.',
  }, 'explicit-concept-rubric');
}

function analyzeConcept(args = {}) {
  const conceptId = String(args.conceptId || '');
  if (!RUBRICS[conceptId]) throw new Error(`Unsupported specialized epistemology concept '${conceptId}'.`);
  const tripartite = tripartiteAnalysis(conceptId, args);
  if (tripartite) return tripartite;
  const computed = analyzeWithExistingService(conceptId, args);
  if (computed) return wrapped({ ...computed, conceptId }, 'domain-service');
  return rubricAnalysis(conceptId, args);
}

module.exports = { analyzeConcept, RUBRICS };
