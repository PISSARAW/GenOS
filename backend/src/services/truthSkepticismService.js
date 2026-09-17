'use strict';

const TRUTH_THEORIES = Object.freeze([
  'correspondence', 'coherence', 'pragmatist', 'deflationary', 'minimalism', 'internal-realism',
]);

function evaluateTruthTheory({ theory, proposition, criterion, context = null } = {}) {
  const knownTheory = TRUTH_THEORIES.includes(theory);
  const criterionProvided = typeof criterion === 'boolean';
  return {
    kind: 'truth-theory-assessment',
    theory: knownTheory ? theory : null,
    proposition: proposition ?? null,
    context,
    criterion: criterionProvided ? criterion : null,
    status: !knownTheory ? 'unknown-theory' : !criterionProvided ? 'criterion-undetermined' : criterion ? 'criterion-satisfied' : 'criterion-not-satisfied',
    truthEstablished: false,
    limitation: 'Un critère de correspondance, cohérence, pragmatisme ou minimalisme évalue un cadre ; il ne suffit pas à établir une vérité métaphysique.',
  };
}

function assessSkepticism({ claim, challenge = 'radical', evidenceCount = 0, defeaters = [], response = null } = {}) {
  const count = Number.isInteger(evidenceCount) && evidenceCount >= 0 ? evidenceCount : 0;
  const activeDefeaters = Array.isArray(defeaters) ? defeaters : [];
  const challenged = challenge === 'radical' || activeDefeaters.length > 0;
  return {
    kind: 'skeptical-challenge',
    claim: claim ?? null,
    challenge,
    evidenceCount: count,
    defeaters: activeDefeaters,
    response: response ?? null,
    status: challenged ? (response ? 'challenge-addressed-provisionally' : 'challenge-open') : 'challenge-not-triggered',
    suspensionRecommended: challenged && !response,
    limitation: 'Le scepticisme met en question la justification disponible ; il ne constitue pas à lui seul une réfutation de la proposition.',
  };
}

function assessRelativism({ claim, context, alternativeContext = null, standardsCompatible = null } = {}) {
  const hasContext = typeof context === 'string' && context.trim().length > 0;
  const hasAlternative = typeof alternativeContext === 'string' && alternativeContext.trim().length > 0;
  const compatible = typeof standardsCompatible === 'boolean' ? standardsCompatible : null;
  return {
    kind: 'relativism-assessment',
    claim: claim ?? null,
    context: context ?? null,
    alternativeContext,
    standardsCompatible: compatible,
    status: !hasContext ? 'context-missing' : hasAlternative && compatible === false ? 'context-relative-disagreement' : 'contextualized-claim',
    universalValidity: compatible === true,
    limitation: 'La contextualisation d’un claim ne rend pas toutes les positions également justifiées et ne supprime pas les exigences de preuve.',
  };
}

module.exports = { TRUTH_THEORIES, evaluateTruthTheory, assessSkepticism, assessRelativism };
