'use strict';

const crypto = require('node:crypto');
const registry = require('./cognitiveObligationRegistry');
const slicer = require('./cognitiveDependencySlicerService');
const projection = require('./cognitiveProjectionJit');
const abi = require('./modelCognitiveAbiService');

const VERSION = 1;

function valueId(index) { return `%${index}`; }

function registryOperations(operations) {
  return operations.map(({ id, kind, state, dependsOn, basis, reason }) => ({
    id, kind, state: state || 'open', dependsOn: dependsOn || [], basis, reason
  }));
}

function promptPlan(prompt, operation, program) {
  const digest = crypto.createHash('sha256').update(prompt).digest('hex');
  const fallback = [
    { id: 'prompt_read', kind: 'READ', state: 'satisfied', dependsOn: [],
      basis: { kind: 'materialized_prompt', reference: `sha256:${digest}` } },
    { id: 'residual_select', kind: 'SELECT', state: 'satisfied', dependsOn: ['prompt_read'],
      basis: { kind: 'materialized_prompt', reference: `sha256:${digest}` } },
    { id: 'model_call_admission', kind: 'CALL', state: 'enforced', dependsOn: ['residual_select'],
      basis: { kind: 'runtime_flag', reference: 'model_route_admitted' } },
    { id: 'residual_inference', kind: 'INFER', state: 'open', dependsOn: ['model_call_admission'] },
    { id: 'candidate_check', kind: 'CHECK', state: 'open', dependsOn: ['residual_inference'] }
  ];
  return registry.plan({ version: registry.VERSION, operation, obligations: program || fallback });
}

function compilePrompt(input = {}) {
  if (typeof input.prompt !== 'string' || !input.prompt) {
    return { status: 'blocked', reason: 'cognitive_prompt_missing', version: VERSION };
  }
  const operation = input.operation || 'INFER';
  const plan = promptPlan(input.prompt, operation, input.program && registryOperations(input.program));
  if (plan.status === 'blocked') return { status: 'blocked', reason: plan.reason, version: VERSION };
  const projected = input.representation && input.representation !== 'portable' && input.program
    ? projection.compile({ value: { operation, input: input.program,
      constraints: { domain: input.domain || 'runtime' } },
    profile: input.projectionProfile || { model: input.model, representations: [input.representation] },
    representation: input.representation }) : null;
  return { status: 'ready', version: VERSION,
    mode: input.program ? 'native_domain_graph' : 'portable_compatibility', operation,
    domain: input.domain || 'runtime', program: input.program || null,
    prompt: projected?.prompt || input.prompt, plan, digest: plan.digest, source: input.source || null,
    projection: projected || { status: 'ready', representation: 'portable', model: input.model || 'unknown-model' },
    representation: projected?.representation || 'portable', selection: input.projectionSelection || null };
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
