'use strict';

const RULES = [
  { type: 'match', envKey: 'language', procKey: 'language', matchScore: 0.35, mismatchScore: -0.2 },
  { type: 'match', envKey: 'taskType', procKey: 'taskType', matchScore: 0.2, mismatchScore: -0.1 },
  { type: 'diff', envKey: 'repositorySize', procKey: 'repositorySize', maxScore: 0.2, divisor: 100000 },
];

function scoreForNiche(niche, procedure) {
  if (!niche?.environment || !procedure) return 0;
  const env = niche.environment;
  let score = 0.5;
  for (const rule of RULES) {
    score += evaluateRule(rule, env, procedure);
  }
  return Math.max(0, Math.min(1, score));
}

function evaluateRule(rule, env, procedure) {
  const envVal = env[rule.envKey];
  const procVal = procedure[rule.procKey];
  if (envVal === undefined || envVal === null || procVal === undefined || procVal === null) return 0;
  if (rule.type === 'match') {
    return envVal === procVal ? rule.matchScore : rule.mismatchScore;
  }
  if (rule.type === 'diff') {
    const diff = Math.abs(Number(envVal) - Number(procVal));
    if (rule.divisor) return Math.max(0, rule.maxScore - diff / rule.divisor);
  }
  return 0;
}

module.exports = { scoreForNiche, RULES };
