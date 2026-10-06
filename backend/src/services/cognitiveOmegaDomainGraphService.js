'use strict';

const crypto = require('node:crypto');
const semanticRegistry = require('./cognitiveOmegaSemanticRegistryService');

const DOMAINS = new Set(['signal', 'trinity', 'biocenose', 'worker', 'evaluation', 'primitive', 'controller', 'runtime']);

const DOMAIN_FIELDS = Object.freeze({
  signal: ['signal', 'context', 'receptor'], trinity: ['mission', 'candidateHypotheses', 'experiment'],
  biocenose: ['member', 'contract', 'input'], worker: ['mission', 'constraints', 'evidence'],
  evaluation: ['benchmark', 'case', 'rubric'], primitive: ['primitive', 'arguments', 'constraints'],
  controller: ['request', 'tenant', 'constraints'], runtime: ['request', 'constraints']
});

const DOMAIN_SEMANTICS = Object.freeze(Object.fromEntries(semanticRegistry.domains()
  .map((domain) => [domain, semanticRegistry.forDomain(domain)])));

function normalizeDomain(domain) { return DOMAINS.has(domain) ? domain : 'runtime'; }

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function resolveObjects(input, domain) {
  const source = input.objects || {};
  return DOMAIN_FIELDS[domain].filter((field) => source[field] !== undefined).map((field) => ({
    id: `${domain}/${field}`, reference: `@${domain}/${field}`, domain, field, value: source[field],
    digest: digest(source[field]), visibility: input.visibility || 'session'
  }));
}

function operationField(field) {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function readOperations(domain, records) {
  const source = records.length ? records : [{ id: `${domain}/request`, reference: `@${domain}/request`,
    domain, field: 'request', value: null, digest: null, visibility: 'session' }];
  return source.map((record) => ({ id: `read_${operationField(record.field)}`, kind: 'READ', reference: record.reference,
    dependsOn: [], objectId: record.id, objectDigest: record.digest, visibility: record.visibility }));
}

function buildSelection(domain, records, reads, semantics, input) {
  return { id: `select_${domain}`, kind: 'SELECT', reference: semantics.selector,
    dependsOn: reads.map((operation) => operation.id), objectRefs: records.map((record) => record.reference),
    fields: records.map((record) => record.field), selection: {
      strategy: input.selectionStrategy || 'domain_semantic', predicate: input.selectionPredicate || null,
      requiredFields: input.requiredFields || records.map((record) => record.field)
    } };
}

function buildProof(domain, semantics, input) {
  return { required: true, method: verificationIntent(input, semantics),
    evidenceRefs: Array.isArray(input.evidenceRefs) ? [...new Set(input.evidenceRefs)] : [],
    independent: input.independentVerification !== false, binding: `infer_${domain}` };
}

function verificationValue(input, semantics) {
  return input.verificationDescriptor || (input.verification && typeof input.verification === 'object'
    ? input.verification : null);
}

function verificationIntent(input, semantics) {
  if (typeof input.verification === 'string') return input.verification;
  if (input.verificationDescriptor?.intent) return input.verificationDescriptor.intent;
  if (input.verificationDescriptor?.type) return input.verificationDescriptor.type;
  return semantics.verification;
}

function build(input = {}) {
  const domain = normalizeDomain(input.domain);
  const semantics = DOMAIN_SEMANTICS[domain];
  const records = resolveObjects(input, domain);
  const reads = readOperations(domain, records);
  const selection = buildSelection(domain, records, reads, semantics, input);
  const callId = `call_${domain}`; const inferId = `infer_${domain}`; const checkId = `check_${domain}`;
  const descriptor = verificationValue(input, semantics);
  const intent = verificationIntent(input, semantics);
  const proof = buildProof(domain, semantics, input);
  const effects = Array.isArray(input.effects) ? input.effects : [];
  const operations = [...reads, selection,
    { id: callId, kind: 'CALL', reference: semantics.tool, dependsOn: [selection.id],
      domainContext: { domain, objectRefs: records.map((record) => record.reference), operation: input.operation || 'INFER' },
      effectContract: { declared: effects, target: semantics.effect } },
    { id: inferId, kind: 'INFER', reference: `model/${domain}`, dependsOn: [callId], inputRef: callId,
      output: input.output || ['candidate'], proofBinding: proof.binding },
    { id: checkId, kind: 'CHECK', reference: `epistemic/${domain}`, dependsOn: [inferId],
      verification: intent, verificationDescriptor: descriptor, proof }];
  if (effects.length) operations.push({ id: `emit_${domain}`, kind: 'EMIT', reference: semantics.effect,
    dependsOn: [checkId], effectContract: { declared: effects, target: semantics.effect }, proofBinding: checkId });
  const graph = { domain, objects: Object.fromEntries(records.map((record) => [record.field, record.value])),
    objectStore: Object.fromEntries(records.map((record) => [record.reference, record.value])),
    objectRecords: records, references: records.map((record) => record.reference), proofs: [proof], effects,
    dependencies: Object.fromEntries(operations.map((operation) => [operation.id, operation.dependsOn])), operations };
  const registryCheck = semanticRegistry.validateGraph(graph);
  if (!registryCheck.valid) throw new Error(registryCheck.reason);
  return graph;
}

module.exports = { build, normalizeDomain, DOMAIN_FIELDS, DOMAIN_SEMANTICS };
