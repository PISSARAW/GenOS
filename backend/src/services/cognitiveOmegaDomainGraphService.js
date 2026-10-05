'use strict';

const DOMAINS = new Set(['signal', 'trinity', 'biocenose', 'worker', 'evaluation', 'primitive', 'controller', 'runtime']);

const DOMAIN_FIELDS = Object.freeze({
  signal: ['signal', 'context', 'receptor'],
  trinity: ['mission', 'candidateHypotheses', 'experiment'],
  biocenose: ['member', 'contract', 'input'],
  worker: ['mission', 'constraints', 'evidence'],
  evaluation: ['benchmark', 'case', 'rubric'],
  primitive: ['primitive', 'arguments', 'constraints'],
  controller: ['request', 'tenant', 'constraints'],
  runtime: ['request', 'constraints']
});

function normalizeDomain(domain) {
  return DOMAINS.has(domain) ? domain : 'runtime';
}

function build(input = {}) {
  const domain = normalizeDomain(input.domain);
  const fields = DOMAIN_FIELDS[domain];
  const objects = {};
  fields.forEach((field) => {
    if (input.objects && input.objects[field] !== undefined) objects[field] = input.objects[field];
  });
  const references = Object.keys(objects).sort().map((field) => `@${domain}/${field}`);
  const readId = `read_${domain}`;
  const selectId = `select_${domain}`;
  return {
    domain, objects, references,
    operations: [
      { id: readId, kind: 'READ', reference: references[0] || `@${domain}/request`, dependsOn: [] },
      { id: selectId, kind: 'SELECT', reference: `@${domain}/residual`, dependsOn: [readId],
        fields: Object.keys(objects) },
      { id: `call_${domain}`, kind: 'CALL', reference: `model/${domain}`,
        dependsOn: [selectId], input: { operation: input.operation || 'INFER' } },
      { id: `infer_${domain}`, kind: 'INFER', dependsOn: [`call_${domain}`],
        output: input.output || ['candidate'] },
      { id: `check_${domain}`, kind: 'CHECK', reference: `epistemic/${domain}`,
        dependsOn: [`infer_${domain}`], verification: input.verification || 'independent' }
    ]
  };
}

module.exports = { build, normalizeDomain };
