'use strict';

const cognitiveExecutor = require('./cognitiveExecutor');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultQuestionText(summary, dimension) {
  return `Quel mécanisme vérifiable explique l'observation « ${summary} » sur ${dimension.name} ?`;
}

function baseline(input) {
  const prior = input.previousQuestion;
  if (prior) {
    return {
      text: `Quelle expérience discriminante doit suivre « ${prior.text} » ?`,
      hypothesis: prior.hypothesis,
      falsifier: prior.falsifier,
      method: `Répéter ou différencier la méthode précédente : ${prior.method}`
    };
  }
  return {
    text: defaultQuestionText(input.summary, input.dimension),
    hypothesis: `Une condition reproductible explique l'écart observé sur ${input.dimension.name}.`,
    falsifier: `Une mesure indépendante satisfait « ${input.dimension.expected} » sans reproduire cet écart.`,
    method: `Comparer le signal aux critères du mandat puis tenter de réfuter l'hypothèse.`
  };
}

function overrides(value) {
  if (typeof value === 'string') return text(value) ? { text: text(value) } : null;
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const field of ['text', 'hypothesis', 'falsifier', 'method']) {
    if (text(value[field])) result[field] = text(value[field]);
  }
  return Object.keys(result).length ? result : null;
}

function describeExperiment(experiment) {
  if (!experiment) return '';
  if (typeof experiment === 'string') return text(experiment);
  return text(experiment.protocol) || text(experiment.method) || '';
}

function fromProposal(generated, fallback) {
  const proposal = generated.selectedTriplet?.[0] || generated.proposals?.[0];
  if (!proposal) return null;
  const falsifiers = Array.isArray(proposal.falsificationCriteria)
    ? proposal.falsificationCriteria.map(text).filter(Boolean) : [];
  const hypothesis = text(proposal.hypothesis);
  if (!hypothesis) return null;
  return {
    text: `Quelle observation permettrait de départager l'hypothèse « ${hypothesis} » ?`,
    hypothesis,
    falsifier: falsifiers.join(' ') || fallback.falsifier,
    method: describeExperiment(proposal.experiment) || fallback.method
  };
}

function missionPrompt(input) {
  const previous = input.previousQuestion
    ? ` La question précédente était : ${input.previousQuestion.text}` : '';
  return `Produire des hypothèses falsifiables pour l'observation suivante : ${input.summary}.${previous}`;
}

async function modelOverrides(input, fallback) {
  const costUsd = Number(input.budget?.usd || 0);
  if (costUsd <= 0) return { value: null, status: 'skipped', reason: 'generation-budget-required' };
  const generated = await cognitiveExecutor.generateProposals({
    mission: { prompt: missionPrompt(input), executionBudget: { costUsd } },
    db: input.db,
    agentId: input.agentId,
    tenant: { organizationId: input.organizationId, projectId: input.projectId }
  });
  return { value: fromProposal(generated, fallback), status: generated.status,
    reason: generated.reason || null, model: generated.model || null,
    provider: generated.provider || null };
}

async function generate(input) {
  const fallback = baseline(input);
  if (typeof input.questionGenerator === 'function') {
    try {
      const supplied = overrides(await input.questionGenerator(input));
      return { question: { ...fallback, ...(supplied || {}) },
        generation: { status: supplied ? 'generated' : 'empty', source: 'injected' } };
    } catch (error) {
      return { question: fallback,
        generation: { status: 'unavailable', source: 'injected', reason: error.code || error.message } };
    }
  }
  try {
    const generated = await modelOverrides(input, fallback);
    const { value, ...metadata } = generated;
    return { question: { ...fallback, ...(value || {}) },
      generation: { ...metadata, source: 'model' } };
  } catch (error) {
    return { question: fallback,
      generation: { status: 'unavailable', source: 'model', reason: error.code || error.message } };
  }
}

module.exports = { defaultQuestionText, generate };
