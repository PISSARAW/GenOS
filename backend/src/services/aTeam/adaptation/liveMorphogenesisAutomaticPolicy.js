'use strict';

const { findMember } = require('../../qualityElevation/qualityFinalPlan');
const { digest } = require('../../evidenceProtocol/canonical');
const KINDS = new Set(['creative_worker', 'bounded_worker', 'specialist', 'synthesis_worker']);
const schema = { type: 'object', additionalProperties: false, required: ['version', 'mode'], properties: {
  version: { const: 2 }, mode: { const: 'automatic' }, requireTransition: { type: 'boolean' },
  budgetPressureRatio: { type: 'number', minimum: 0.1, maximum: 0.95 },
  defectCodes: { type: 'array', minItems: 1, uniqueItems: true,
    items: { type: 'string', pattern: '^[A-Za-z0-9_]+$' } }
} };

function enabled(value) { return value?.version === 2 && value.mode === 'automatic'; }
function supported(member) { return KINDS.has(member.workerKind); }
function pairs(members) {
  return members.filter(supported).flatMap(target => (target.dependsOn || []).map(id => ({
    target, source: findMember(members, id)
  })).filter(pair => pair.source !== target && supported(pair.source)));
}

function assertEligible(members) {
  if (!pairs(members).length) throw Object.assign(new Error('Automatic replacement needs a supported producer-consumer dependency.'),
    { code: 'ATEAM_AUTO_MORPH_NO_ELIGIBLE_DEPENDENCY' });
}

function selection(pair) {
  return { afterMember: pair.source.memberId, targetMember: pair.target.memberId,
    replacement: { role: pair.target.role,
      missionAppend: 'Integrate the authenticated upstream observations. Re-examine observed defects in your deliverable, and use measured resource pressure to avoid redundant work. Preserve task scope, rights, sources and quality requirements.' } };
}

function effective(run) {
  if (!enabled(run.adaptiveMorphogenesis)) return run.adaptiveMorphogenesis;
  const live = run.execution.liveMorphogenesis;
  const selected = live?.selection || live?.receipt?.plan?.aTeamPendingReplacement?.selection;
  const match = pairs(run.members).find(pair => pair.source.memberId === selected?.afterMember
    && pair.target.memberId === selected?.targetMember);
  if (!match || digest(selection(match)) !== digest(selected)) {
    throw Object.assign(new Error('Automatic selection must match the declared graph and unchanged target role.'),
      { code: 'ATEAM_AUTO_MORPH_SELECTION_INVALID' });
  }
  return selected;
}

module.exports = { schema, enabled, supported, pairs, assertEligible, selection, effective };
