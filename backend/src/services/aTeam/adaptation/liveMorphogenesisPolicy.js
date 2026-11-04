'use strict';

const { digest } = require('../../evidenceProtocol/canonical');
const { findMember } = require('../../qualityElevation/qualityFinalPlan');
const schema = { type: 'object', additionalProperties: false,
  required: ['version', 'afterMember', 'targetMember', 'replacement'], properties: {
    version: { const: 1 }, afterMember: { type: 'string', minLength: 1 },
    targetMember: { type: 'string', minLength: 1 }, requireTransition: { type: 'boolean' },
    defectCodes: { type: 'array', minItems: 1, uniqueItems: true,
      items: { type: 'string', pattern: '^[A-Za-z0-9_]+$' } },
    replacement: { type: 'object', additionalProperties: false,
      required: ['role', 'missionAppend'], properties: {
        role: { type: 'string', minLength: 1 },
        missionAppend: { type: 'string', minLength: 1, maxLength: 6000 }
      } }
  } };
const validate = new (require('ajv'))({ allErrors: true, strict: false }).compile(schema);

function configure(request, members) {
  const value = request.adaptiveMorphogenesis;
  if (value === undefined) return undefined;
  assertPolicy(value, members);
  if (request.morphogenesis !== true || !request.qualityElevation) {
    throw fail('ATEAM_LIVE_MORPH_QUALITY_REQUIRED', 'Live morphogenesis requires explicit morphology and quality obligations.');
  }
  assertAuthorityConfigured();
  return structuredClone(value);
}

function assertPolicy(value, members) {
  if (!validate(value)) throw fail('ATEAM_LIVE_MORPH_POLICY_INVALID', JSON.stringify(validate.errors));
  assertMembers(value, members);
}

function bind(value, members) {
  if (!value) return value;
  assertPolicy(value, members);
  return { ...value, afterMember: findMember(members, value.afterMember).memberId,
    targetMember: findMember(members, value.targetMember).memberId };
}

function assertMembers(policy, members) {
  const source = findMember(members, policy.afterMember), target = findMember(members, policy.targetMember);
  const kind = require('../../agents/workerKindService');
  if (source === target || source.workerKind !== 'creative_worker' || target.workerKind !== 'creative_worker'
    || kind.resolveWorkerKind(undefined, policy.replacement.role) !== 'creative_worker') {
    throw fail('ATEAM_LIVE_MORPH_KIND_INVALID', 'This profile replaces a pending creative member after a creative producer.');
  }
}

function assertAuthorityConfigured() {
  if (!process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM || !process.env.GENOS_CLI_AUTHORITY_TRUST_JSON) {
    throw fail('ATEAM_LIVE_MORPH_AUTHORITY_REQUIRED', 'Configure the pinned Rust transition authority before live morphogenesis.');
  }
}

function assertUnchanged(current, next) {
  const value = run => [run.adaptiveMorphogenesis || null,
    run.adaptiveMorphogenesis ? run.execution?.runtimeMissionId || null : null];
  if (digest(value(current)) !== digest(value(next))) {
    throw fail('ATEAM_LIVE_MORPH_POLICY_CHANGED', 'The formed live policy and runtime mission cannot change.');
  }
}

function candidateId(run) {
  const target = findMember(run.members, run.adaptiveMorphogenesis.targetMember);
  return require('../aTeamRuntime').stableId('worker', `${run.teamRunId}:live-morph:${target.memberId}`);
}

function fail(code, message) { return Object.assign(new Error(message), { code }); }
module.exports = { configure, assertUnchanged, assertMembers, assertPolicy, bind, candidateId, fail };
