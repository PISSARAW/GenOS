'use strict';

const { digestPayload } = require('./communicationEnvelopeService');

const INTENT_FIELDS = ['senderAgentId', 'missionId', 'purpose', 'risk', 'urgency', 'domain',
  'requiresAction', 'requestedAudience', 'independenceRequired', 'independenceThreshold',
  'semanticRefs', 'artifactRefs', 'scope', 'checkpoint', 'invalidation', 'retraction'];
const PLAN_FIELDS = ['action', 'scope', 'recipients', 'encoding', 'grounding', 'ttlMs'];

function fieldsOf(value, fields) {
  return Object.fromEntries(fields.map(key => [key, value[key] ?? null]));
}

function intentFingerprint(intent) {
  return digestPayload(fieldsOf(intent, INTENT_FIELDS));
}

function planFingerprint(decision, audit) {
  return digestPayload({ decision: fieldsOf(decision, PLAN_FIELDS),
    intent: audit.intentFingerprint, semanticRefs: audit.semanticRefs,
    missionId: audit.missionId, scope: audit.scope, orchestratorId: audit.orchestratorId,
    organization: audit.organization, organizationVersion: audit.organizationVersion });
}

module.exports = { intentFingerprint, planFingerprint };
