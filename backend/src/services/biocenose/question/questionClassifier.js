'use strict';

const QUESTION_TYPES = Object.freeze([
  'FACTUAL', 'PROBABILISTIC', 'DESIGN', 'MULTI_CRITERIA', 'NORMATIVE', 'EXPLORATORY', 'MIXED'
]);

const RULES = [
  ['NORMATIVE', /\b(should|ought|ethical|ethics|moral|morality|should we|devrait|doit-on|faut-il|ethique|moralement|acceptable)\b/],
  ['PROBABILISTIC', /\b(probability|probabilit|likelihood|likely|chance|forecast|predict|risk|probable|risque|prevision|prevoir|vraisemblable)\b/],
  ['MULTI_CRITERIA', /\b(compare|comparison|trade.?off|best|optimal|rank|prioritize|criteria|criterion|comparer|meilleur|optimiser|criteres|quelle option|quel choix)\b/],
  ['DESIGN', /\b(design|architect|build|implement|create|develop|construire|concevoir|architecture|implementer|developper|solution technique)\b/],
  ['FACTUAL', /\b(what is|who is|when did|where is|how many|is it true|verify|prove|confirm|what happened|qu est ce|qui est|quand|ou se trouve|combien|verifier|prouver|confirmer|est ce vrai)\b/],
  ['EXPLORATORY', /\b(explore|brainstorm|possibilities|ideas|what if|landscape|explorer|pistes|possibilites|idees|imaginer|quelles sont les options)\b/]
];

function normalizeQuestion(question) {
  return String(question || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ' ').replace(/[^a-z0-9?' ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function classifyQuestion(question, options = {}) {
  const override = String(options.questionType || '').toUpperCase();
  if (QUESTION_TYPES.includes(override)) {
    return { questionType: override, confidence: 1, signals: ['explicit_override'], method: 'explicit_override' };
  }
  if (override) throw Object.assign(new Error(`Unknown Biocenose question type '${override}'.`), { code: 'BIOCENOSE_QUESTION_TYPE_INVALID' });
  const normalized = normalizeQuestion(question);
  const signals = RULES.filter(([, pattern]) => pattern.test(normalized)).map(([type]) => type);
  const substantive = signals.filter((type) => type !== 'EXPLORATORY');
  if (substantive.length > 1) return result('MIXED', 0.55, signals);
  if (substantive.length === 1) return result(substantive[0], 0.72, signals);
  if (signals.length) return result('EXPLORATORY', 0.55, signals);
  return result('EXPLORATORY', 0.35, ['no_specific_signal']);
}

function result(questionType, confidence, signals) {
  return { questionType, confidence, signals, method: 'keyword_heuristic' };
}

module.exports = { QUESTION_TYPES, normalizeQuestion, classifyQuestion };
