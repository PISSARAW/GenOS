'use strict';

const { createEnvironment } = require('../contracts/environment');

function mapMissionEnvironment(input = {}) {
  const source = input.environment && typeof input.environment === 'object' ? input.environment : {};
  return createEnvironment({
    ...source,
    environmentId: source.environmentId || `${input.environmentId || 'biome'}:environment`,
    boundaries: source.boundaries || { scope: input.scope || 'mission' },
    unresolvedProblems: mergeProblem(source.unresolvedProblems, input.mission),
    version: source.version || 1
  });
}

function mergeProblem(problems, mission) {
  const existing = Array.isArray(problems) ? problems : [];
  const goal = String(mission || '').trim();
  if (!goal || existing.some((problem) => problem?.kind === 'mission_goal')) return existing;
  return [...existing, { kind: 'mission_goal', description: goal }];
}

module.exports = { mapMissionEnvironment };
