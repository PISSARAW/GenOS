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
  const projected = compilePromptProjected(input, operation);
  return compilePromptResult({ input, operation, projected, plan });
}

function buildObligationValues(operations) {
  const values = new Map();
  const obligations = [];
  operations.forEach((operation, index) => {
    const id = operation.id || `op_${index}`;
    if (values.has(id)) throw new Error('cognitive_program_duplicate_id');
    const value = valueId(index + 1);
    values.set(id, value);
    const obligation = compileObligation(id, operation);
    if (operation.basis) obligation.basis = operation.basis;
    if (operation.reason) obligation.reason = operation.reason;
    obligations.push(obligation);
  });
  return { values, obligations };
}

function renderOmegaProjection(input, selected, model) {
  const profile = compilerAbiProfile(input, model);
  return projection.compile({ value: { operation: 'OMEGA', input: selected,
    constraints: input.constraints }, profile, representation: input.representation });
}

function digestRenderedPrompt(rendered) {
  return crypto.createHash('sha256').update(rendered.prompt || '').digest('hex');
}

function compile(input = {}) {
  if (!Array.isArray(input.operations) || !input.operations.length) {
    return { status: 'blocked', reason: 'cognitive_program_empty', version: VERSION };
  }
  const built = buildObligationValues(input.operations);
  const plan = registry.plan({ version: registry.VERSION, operation: 'OMEGA', obligations: built.obligations });
  if (plan.status === 'blocked') return { status: 'blocked', reason: plan.reason, version: VERSION };
  const slice = slicer.slice({ nodes: input.operations, targets: input.targets });
  if (slice.status !== 'ready') return { ...slice, version: VERSION };
  const selected = slice.nodes.map((node) => ({ ...node, value: built.values.get(node.id) }));
  const model = input.model || 'unknown-model';
  const rendered = renderOmegaProjection(input, selected, model);
  return { status: rendered.status, version: VERSION, plan, slice: { ...slice, nodes: selected },
    projection: rendered, digest: `sha256:${digestRenderedPrompt(rendered)}`, values: Object.fromEntries(built.values) };
}

module.exports = { VERSION, compile, compilePrompt };

function compilePromptProjected(input, operation) {
  return input.representation && input.representation !== 'portable' && input.program
    ? projection.compile({ value: { operation, input: { task: input.prompt, program: input.program },
      constraints: { domain: input.domain || 'runtime' } },
    profile: input.projectionProfile || { model: input.model, representations: [input.representation] },
    representation: input.representation }) : null;
}

function compilerAbiProfile(input, model) {
  return (input.abi || abi.createRegistry()).profile(model);
}

function compilePromptCondition(projected, input) {
  return projected || { status: 'ready', representation: 'portable', model: input.model || 'unknown-model' };
}

function compilePromptResult({ input, operation, projected, plan }) {
  return { status: 'ready', version: VERSION,
    mode: input.program ? 'native_domain_graph' : 'portable_compatibility', operation,
    domain: input.domain || 'runtime', program: input.program || null,
    prompt: projected?.prompt || input.prompt, plan,
    digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify({ prompt: input.prompt,
      program: input.program || null, plan: plan.digest })).digest('hex')}`, source: input.source || null,
    projection: compilePromptCondition(projected, input),
    representation: projected?.representation || 'portable', selection: input.projectionSelection || null,
    economy: input.economy || null };
}

function compileObligation(id, operation) {
  return { id, kind: operation.kind, state: operation.state || 'open',
      dependsOn: operation.dependsOn || [] };
}
