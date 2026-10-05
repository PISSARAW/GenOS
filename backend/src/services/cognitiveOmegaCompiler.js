'use strict';

const crypto = require('node:crypto');
const registry = require('./cognitiveObligationRegistry');
const slicer = require('./cognitiveDependencySlicerService');
const projection = require('./cognitiveProjectionJit');
const abi = require('./modelCognitiveAbiService');

const VERSION = 1;

function valueId(index) { return `%${index}`; }

function promptPlan(prompt, operation) {
  const digest = crypto.createHash('sha256').update(prompt).digest('hex');
  return registry.plan({ version: registry.VERSION, operation, obligations: [
    { id: 'prompt_input', kind: 'INPUT', state: 'satisfied', dependsOn: [],
      basis: { kind: 'materialized_prompt', reference: `sha256:${digest}` } },
    { id: 'residual_inference', kind: 'INFER', state: 'open', dependsOn: ['prompt_input'] }
  ] });
}

function compilePrompt(input = {}) {
  if (typeof input.prompt !== 'string' || !input.prompt) {
    return { status: 'blocked', reason: 'cognitive_prompt_missing', version: VERSION };
  }
  const operation = input.operation || 'INFER';
  const plan = promptPlan(input.prompt, operation);
  if (plan.status !== 'ready') return { status: 'blocked', reason: plan.reason, version: VERSION };
  return { status: 'ready', version: VERSION, mode: 'portable_compatibility', operation,
    prompt: input.prompt, plan, digest: plan.digest, source: input.source || null };
}

function compile(input = {}) {
  if (!Array.isArray(input.operations) || !input.operations.length) {
    return { status: 'blocked', reason: 'cognitive_program_empty', version: VERSION };
  }
  const values = new Map();
  const obligations = [];
  input.operations.forEach((operation, index) => {
    const id = operation.id || `op_${index}`;
    if (values.has(id)) throw new Error('cognitive_program_duplicate_id');
    const value = valueId(index + 1);
    values.set(id, value);
    const obligation = { id, kind: operation.kind, state: operation.state || 'open',
      dependsOn: operation.dependsOn || [] };
    if (operation.basis) obligation.basis = operation.basis;
    if (operation.reason) obligation.reason = operation.reason;
    obligations.push(obligation);
  });
  const plan = registry.plan({ version: registry.VERSION, operation: 'OMEGA', obligations });
  if (plan.status === 'blocked') return { status: 'blocked', reason: plan.reason, version: VERSION };
  const slice = slicer.slice({ nodes: input.operations, targets: input.targets });
  if (slice.status !== 'ready') return { ...slice, version: VERSION };
  const selected = slice.nodes.map((node) => ({ ...node, value: values.get(node.id) }));
  const model = input.model || 'unknown-model';
  const profile = (input.abi || abi.createRegistry()).profile(model);
  const rendered = projection.compile({ value: { operation: 'OMEGA', input: selected,
    constraints: input.constraints }, profile, representation: input.representation });
  const digest = crypto.createHash('sha256').update(rendered.prompt || '').digest('hex');
  return { status: rendered.status, version: VERSION, plan, slice: { ...slice, nodes: selected },
    projection: rendered, digest: `sha256:${digest}`, values: Object.fromEntries(values) };
}

module.exports = { VERSION, compile, compilePrompt };
