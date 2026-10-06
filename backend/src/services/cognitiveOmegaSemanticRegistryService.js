'use strict';

const catalog = require('../../../shared/cognitiveOmegaSemanticHandlers.json');

const REQUIRED_FIELDS = ['selector', 'tool', 'infer', 'verification', 'effect'];

function entries() { return catalog.handlers || {}; }

function forDomain(domain) {
  const value = entries()[String(domain || '').trim().toLowerCase()];
  if (!value || REQUIRED_FIELDS.some((field) => typeof value[field] !== 'string' || !value[field])) return null;
  return Object.freeze({ domain: String(domain).trim().toLowerCase(), ...value });
}

function domains() { return Object.keys(entries()).sort(); }

function resolve(reference) {
  return domains().map(forDomain).find((item) => Object.values(item).includes(reference)) || null;
}

function validateGraph(graph) {
  const semantic = forDomain(graph?.domain);
  if (!semantic) return { valid: false, reason: 'omega_domain_unknown' };
  const expected = { SELECT: semantic.selector, CALL: semantic.tool, INFER: semantic.infer,
    CHECK: `epistemic/${graph.domain}`, EMIT: semantic.effect };
  const unknown = (graph.operations || []).filter((operation) => operation.kind !== 'READ'
    && operation.reference !== expected[operation.kind]).map((operation) => operation.reference);
  const check = (graph.operations || []).find((operation) => operation.kind === 'CHECK');
  if (check?.verification && check.verification !== semantic.verification
    && check.verificationDescriptor?.type !== check.verification) {
    return { valid: false, reason: 'omega_verification_intent_mismatch' };
  }
  return unknown.length ? { valid: false, reason: 'omega_semantic_reference_unknown', unknown } : { valid: true, semantic };
}

module.exports = { catalog, domains, forDomain, resolve, validateGraph };
