'use strict';

const { previewRuntimeEffect } = require('./philosophyRuntimeEffectService');

const POSTURE_RULES = Object.freeze([
  { effect: 'require_evidence', markers: ['falsif', 'hypothes', 'verify', 'validation', 'prove', 'evidence', 'uncertain', 'unknown', '?'] },
  { effect: 'hold_promotion', markers: ['promot', 'deploy', 'merge', 'release', 'publish'] },
  { effect: 'prefer_observation', markers: ['observ', 'survey', 'explor', 'recon', 'scan', 'watch'] }
]);

const POSTURE_DIRECTIVES = Object.freeze({
  require_evidence: 'Cognitive posture REQUIRE_EVIDENCE: do not promote any claim without cited evidence and stated uncertainty.',
  hold_promotion: 'Cognitive posture HOLD_PROMOTION: collect findings only; do not promote, deploy or merge.',
  prefer_observation: 'Cognitive posture PREFER_OBSERVATION: observe and report before acting.'
});

function detectPosture(prompt) {
  const text = String(prompt || '').toLowerCase();
  for (const rule of POSTURE_RULES) {
    if (rule.markers.some((marker) => text.includes(marker))) return rule.effect;
  }
  return null;
}

function attachPosture(input) {
  const source = input || {};
  const effect = detectPosture(source.prompt);
  if (!effect) return null;
  const receipt = previewRuntimeEffect({
    concept: 'mission-cognition',
    agentId: source.agentId || 'orchestrator',
    effect,
    parameters: { source: 'dispatch-posture', matched: effect }
  });
  return { effect, directive: POSTURE_DIRECTIVES[effect], receipt };
}

module.exports = { POSTURE_RULES, POSTURE_DIRECTIVES, detectPosture, attachPosture };
