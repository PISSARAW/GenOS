'use strict';

const { getDatabase } = require('../../db');
const { listRelations, deriveProperties } = require('../crossAgentRelationalService');

const CLASS_DEFAULTS = Object.freeze({
  lineage: { inheritedContext: 'high', dialectProbability: 'high', explanationRequirement: 'low', preferredEncoding: 'dialect', recommendedGrounding: 'semantic_ack' },
  organizational: { inheritedContext: 'medium', dialectProbability: 'medium', explanationRequirement: 'medium', preferredEncoding: 'compact', recommendedGrounding: 'action_ack' },
  collaborative: { inheritedContext: 'medium', dialectProbability: 'high', explanationRequirement: 'low', preferredEncoding: 'dialect', recommendedGrounding: 'semantic_ack' },
  social: { inheritedContext: 'medium', dialectProbability: 'medium', explanationRequirement: 'medium', preferredEncoding: 'canonical', recommendedGrounding: 'semantic_ack' },
  epistemic: { inheritedContext: 'low', dialectProbability: 'low', explanationRequirement: 'high', preferredEncoding: 'evidence', recommendedGrounding: 'verified_ack' },
  adversarial: { inheritedContext: 'none', dialectProbability: 'none', explanationRequirement: 'high', preferredEncoding: 'canonical', recommendedGrounding: 'verified_ack' }
});

const TYPE_OVERRIDES = Object.freeze({
  twin: { explanationRequirement: 'minimal', errorCorrelation: 0.9 },
  adversary: { disclosureLevel: 0.1, signedEvidence: true, privateCommonGround: false },
  reviewer: { hideOwnConclusions: true },
  verifier: { hideOwnConclusions: true }
});

const STRANGER_PROFILE = Object.freeze({
  relationType: null, relationClass: null, direction: 'unknown',
  relationTypes: [], relations: [],
  trustForDomain: null,
  inheritedContext: 'none', dialectProbability: 'low', explanationRequirement: 'high',
  epistemicIndependence: null, errorCorrelation: null, independenceStatus: 'unknown', authority: 0, disclosureLevel: 0.3,
  preferredEncoding: 'canonical', recommendedGrounding: 'semantic_ack', explicitAssumptions: true
});

function numOf(value, fallback) {
  if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
  return fallback;
}

function isAuthorityRole(role) {
  return role === 'orchestrator' || role === 'manager' || role === 'lead';
}

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function pairRelations(input) {
  const { db, fromId, toId } = input;
  const all = await listRelations({ db, agentId: fromId,
    organizationId: input.organizationId, projectId: input.projectId });
  const matches = [];
  for (const relation of all) {
    const forward = relation.sourceAgentId === fromId && relation.targetAgentId === toId;
    const backward = relation.sourceAgentId === toId && relation.targetAgentId === fromId;
    if (forward || backward) matches.push({ relation, direction: forward ? 'forward' : 'reverse' });
  }
  return matches;
}

async function rolesOf(db, fromId, toId) {
  const rows = await db.all('SELECT id, role FROM agents WHERE id IN (?, ?)', [fromId, toId]);
  const roles = {};
  for (const row of rows) {
    roles[row.id] = row.role || 'unknown';
  }
  return roles;
}

function measuredOf(entry) {
  const metadata = entry.relation.metadata || {};
  const prior = deriveProperties(entry.relation.relationType);
  return {
    epistemicIndependence: numOf(metadata.epistemicIndependence, prior.epistemicIndependence),
    errorCorrelation: numOf(metadata.errorCorrelation, prior.errorCorrelation),
    authority: numOf(metadata.authority, prior.authority),
    disclosureLevel: numOf(metadata.disclosureLevel, prior.disclosureLevel)
  };
}

function domainTrustOf(entry, domain) {
  if (typeof domain !== 'string' || !domain.trim()) return null;
  const trust = entry.relation.metadata?.trustByDomain?.[domain.trim()];
  return Number.isFinite(trust) && trust >= 0 && trust <= 1 ? trust : null;
}

function pickPrimary(matches) {
  let best = null;
  let bestScore = 2;
  for (const entry of matches) {
    const score = measuredOf(entry).epistemicIndependence;
    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

function baseProfileOf(entry, domain) {
  const relation = entry.relation;
  const defaults = CLASS_DEFAULTS[relation.relationClass] || CLASS_DEFAULTS.social;
  const override = TYPE_OVERRIDES[relation.relationType] || {};
  const measured = measuredOf(entry);
  return Object.assign({}, defaults, override, measured, {
    relationType: relation.relationType,
    relationClass: relation.relationClass,
    direction: entry.direction,
    trustForDomain: domainTrustOf(entry, domain),
    explicitAssumptions: false
  });
}

function adjustForDirection(ctx) {
  const fromAuthority = isAuthorityRole(ctx.roles[ctx.fromId]);
  const toAuthority = isAuthorityRole(ctx.roles[ctx.toId]);
  if (fromAuthority && !toAuthority) {
    return Object.assign({}, ctx.profile, {
      preferredEncoding: 'compact-directive', recommendedGrounding: 'action_ack', authorityChecked: true
    });
  }
  if (!fromAuthority && toAuthority) {
    return Object.assign({}, ctx.profile, {
      preferredEncoding: 'evidence-first', differentialStatus: true, includeAnomalies: true
    });
  }
  return ctx.profile;
}

function aggregateRelations(primary, relations) {
  const values = (key) => relations.map((relation) => relation[key]);
  return {
    ...primary,
    relationTypes: [...new Set(relations.map((relation) => relation.relationType))],
    relations,
    epistemicIndependence: Math.min(...values('epistemicIndependence')),
    errorCorrelation: Math.max(...values('errorCorrelation')),
    disclosureLevel: Math.min(...values('disclosureLevel'))
  };
}

async function deriveProfile(input) {
  const db = await resolveDb(input.db);
  const matches = await pairRelations({ db, fromId: input.fromAgentId, toId: input.toAgentId,
    organizationId: input.organizationId, projectId: input.projectId });
  if (matches.length === 0) return Object.assign({}, STRANGER_PROFILE);
  const relations = matches.map((entry) => baseProfileOf(entry, input.domain));
  const primary = pickPrimary(matches);
  const roles = await rolesOf(db, input.fromAgentId, input.toAgentId);
  const profile = adjustForDirection({ profile: baseProfileOf(primary, input.domain), roles,
    fromId: input.fromAgentId, toId: input.toAgentId });
  return aggregateRelations(profile, relations);
}

module.exports = { STRANGER_PROFILE, deriveProfile };
