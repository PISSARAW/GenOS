'use strict';

const crypto = require('crypto');
const provenanceGate = require('./highImpactProvenanceGateService');

function safeInput(input) {
  if (input === undefined) return {};
  if (input === null) return {};
  if (typeof input !== 'object') return {};
  return input;
}

function textField(source, key, fallback) {
  const value = source[key];
  if (typeof value === 'string') return value;
  if (value === undefined) return fallback;
  if (value === null) return fallback;
  return String(value);
}

function arrayField(source, key) {
  const value = source[key];
  if (Array.isArray(value)) return value.slice();
  return [];
}

function nullableField(source, key) {
  const value = source[key];
  if (value === undefined) return null;
  return value;
}

function defineContext(input) {
  const source = safeInput(input);
  return {
    principal: textField(source, 'principal', 'unknown'),
    organization: nullableField(source, 'organization'),
    project: nullableField(source, 'project'),
    authority: textField(source, 'authority', 'none'),
    leases: arrayField(source, 'leases'),
    taints: arrayField(source, 'taints'),
    dataClassification: textField(source, 'dataClassification', 'internal'),
    actionRisk: textField(source, 'actionRisk', 'LOW'),
    reversibility: textField(source, 'reversibility', 'reversible'),
    affectedResources: arrayField(source, 'affectedResources'),
    autonomyLevel: textField(source, 'autonomyLevel', 'supervised'),
    requiredApprovals: arrayField(source, 'requiredApprovals'),
    complianceConstraints: arrayField(source, 'complianceConstraints')
  };
}

function riskOfAction(input) {
  const source = safeInput(input);
  const action = safeInput(source.action);
  return {
    risk: textField(action, 'risk', 'LOW'),
    impact: textField(action, 'impact', 'low'),
    reversibility: textField(action, 'reversibility', 'reversible'),
    blastRadius: textField(action, 'blastRadius', 'local')
  };
}

function verdictForRisk(risk) {
  if (risk === 'CRITICAL') return 'HUMAN_REVIEW';
  if (risk === 'HIGH') return 'HUMAN_REVIEW';
  if (risk === 'MEDIUM') return 'BOUNDED_APPROVE';
  return 'APPROVE';
}

function evaluate(input) {
  const source = safeInput(input);
  const context = safeInput(source.context);
  const action = riskOfAction({ action: safeInput(source.action) });
  const risk = textField(context, 'actionRisk', action.risk);
  const base = decision({ verdict: verdictForRisk(risk), context, action });
  return escalateForMissingProvenance({ base, context, action });
}

function isFinalVerdict(base) {
  if (!base) return false;
  return base.verdict === 'HUMAN_REVIEW' || base.verdict === 'DENY';
}

function gateInputFor(context, action) {
  const ctx = safeInput(context);
  const act = safeInput(action);
  return {
    action: textField(act, 'name', 'read'),
    risk: textField(act, 'risk', 'LOW'),
    reversibility: textField(act, 'reversibility', 'reversible'),
    blastRadius: textField(act, 'blastRadius', 'local'),
    evidenceRefs: Array.isArray(ctx.evidenceRefs) ? ctx.evidenceRefs : [],
    provenanceHash: textField(ctx, 'provenanceHash', '')
  };
}

function deniedVerdict(gate) {
  if (gate.verdict === 'DENY') return 'DENY';
  return 'HUMAN_REVIEW';
}

function escalateForMissingProvenance(input) {
  const source = safeInput(input);
  if (isFinalVerdict(source.base)) return source.base;
  const gate = provenanceGate.gate(gateInputFor(source.context, source.action));
  if (gate.verdict === 'ALLOW') return source.base;
  return decision({
    verdict: deniedVerdict(gate),
    context: source.context,
    action: source.action,
    reason: gate.reason
  });
}

function boundsForVerdict(verdict) {
  if (verdict === 'BOUNDED_APPROVE') return ['evidence-gate', 'lease-scoped'];
  return [];
}

function decision(input) {
  const source = safeInput(input);
  const verdict = textField(source, 'verdict', 'DENY');
  const payload = JSON.stringify(verdictPayload(source, verdict));
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  return { verdict, bounds: boundsForVerdict(verdict), dossier: compactDossier(source), hash, at: new Date().toISOString() };
}

function verdictPayload(source, verdict) {
  return { verdict, context: safeInput(source.context), action: safeInput(source.action) };
}

function compactDossier(input) {
  const source = safeInput(input);
  return {
    action: safeInput(source.action),
    reason: textField(source, 'reason', 'risk-aware governance gate'),
    uncertainty: nullableField(source, 'uncertainty'),
    rollback: nullableField(source, 'rollback')
  };
}

function countField(plan, key) {
  const value = plan[key];
  if (Array.isArray(value)) return value.length;
  return 0;
}

function needsReview(changes, spawns) {
  if (changes > 3) return true;
  if (spawns > 10) return true;
  return false;
}

function gateMorphogenesis(input) {
  const source = safeInput(input);
  const plan = safeInput(source.plan);
  const context = safeInput(source.context);
  if (needsReview(countField(plan, 'topologyChanges'), countField(plan, 'spawn'))) {
    return decision({ verdict: 'HUMAN_REVIEW', context, action: { risk: 'HIGH' }, reason: 'blast radius eleve' });
  }
  return evaluate({ context, action: { risk: textField(context, 'actionRisk', 'LOW') } });
}

module.exports = {
  defineContext,
  riskOfAction,
  evaluate,
  gateMorphogenesis
};
