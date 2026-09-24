'use strict';

function intersectAuthority(parent, child) {
  if (!Array.isArray(parent)) return Array.isArray(child) ? [...child] : [];
  if (!Array.isArray(child)) return [...parent];
  return parent.filter((right) => child.includes(right));
}

function childContext(context, child, isolated) {
  const requested = child.authority;
  return {
    ...context,
    authority: intersectAuthority(context.authority, requested),
    budget: { ...(context.budget || {}) },
    state: isolated ? { ...(context.state || {}) } : context.state,
    input: context.input
  };
}

function assertChildren(children) {
  if (!Array.isArray(children) || children.some((child) => typeof child !== 'function')) {
    throw new TypeError('composition children must be executable functions');
  }
}

async function invoke(child, context, index) {
  const local = childContext(context, child, false);
  return child(local);
}

async function runParallel(children, context, isolated = true) {
  const budgets = divideBudget(context.budget || {}, children.length);
  return Promise.all(children.map((child, index) => {
    const local = childContext(context, child, isolated);
    local.budget = budgets[index];
    return child(local);
  }));
}

function divideBudget(budget, count) {
  return Array.from({ length: count }, () => ({})).map((share) => {
    for (const [key, value] of Object.entries(budget)) share[key] = value;
    return share;
  }).map((share) => {
    for (const [key, value] of Object.entries(share)) {
      if (Number.isFinite(value)) share[key] = value / Math.max(1, count);
    }
    return share;
  });
}

async function runSequence(children, context, gates = []) {
  const results = [];
  let current = context;
  for (let index = 0; index < children.length; index += 1) {
    if (gates[index] && !(await gates[index](current, results))) {
      results.push({ skipped: true, reason: 'gate rejected' });
      continue;
    }
    const result = await invoke(children[index], current, index);
    results.push(result);
    current = {
      ...current,
      input: result && result.value,
      state: result && result.state,
      budget: result && result.budget ? result.budget : current.budget
    };
  }
  return results;
}

async function runGate(children, context, config = {}) {
  const [guard, accepted, rejected] = children;
  const verdict = await invoke(guard, context, 0);
  const branch = verdict && verdict.value ? accepted : rejected;
  if (!branch) return { verdict, value: null, state: context.state };
  const result = await invoke(branch, { ...context, input: verdict.value }, 1);
  return { verdict, result, state: result && result.state, config };
}

async function runCompete(children, context, select = (results) => results[0]) {
  const results = await runParallel(children, context, true);
  return { results, winner: await select(results), state: context.state };
}

async function runWrap(child, context, environment = {}) {
  const execute = () => invoke(child, context, 0);
  const result = typeof environment.wrap === 'function' ? await environment.wrap(execute, context) : await execute();
  return { result, environment: environment.name || null, state: result && result.state };
}

async function runBridge(children, context, adapter) {
  const source = await invoke(children[0], context, 0);
  if (typeof adapter !== 'function') throw new TypeError('BRIDGE requires an output adapter');
  const translated = await adapter(source && source.value, source, context);
  const target = await invoke(children[1], { ...context, input: translated }, 1);
  return { source, translated, target, state: target && target.state };
}

async function runFederate(children, context, merge = (values) => values) {
  const results = await runParallel(children, context, true);
  const value = await merge(results.map((result) => result && result.value), context);
  return { results, value, state: context.state };
}

async function runNest(children, context) {
  const nested = await invoke(children[0], context, 0);
  const innerContext = { ...context, input: nested && nested.value, state: nested && nested.state };
  const results = await runSequence(children.slice(1), innerContext);
  const last = results[results.length - 1];
  return { nested, results, state: last && last.state ? last.state : innerContext.state };
}

function lifecycleHooks(context, phase, detail) {
  const hook = context.lifecycle && context.lifecycle[phase];
  if (typeof hook === 'function') return hook(detail);
  return undefined;
}

async function executeComposition(spec, context = {}) {
  assertChildren(spec.children);
  await lifecycleHooks(context, 'start', { kind: spec.kind, children: spec.children.length });
  try {
    const result = await spec.run(context);
    await lifecycleHooks(context, 'complete', { kind: spec.kind, result });
    return result;
  } catch (error) {
    await lifecycleHooks(context, 'error', { kind: spec.kind, error });
    throw error;
  } finally {
    await lifecycleHooks(context, 'stop', { kind: spec.kind });
  }
}

function createCompositionOperator(kind, run) {
  return {
    kind,
    semantics: {
      authority: 'child grants are intersected with the parent authority',
      budget: 'the caller budget is propagated to each invocation',
      state: 'parallel branches receive isolated state; sequential branches receive prior output',
      errors: 'errors fail the composition and propagate to the caller',
      lifecycle: 'start, complete or error, then stop hooks are emitted'
    },
    execute(children, context = {}, config = {}) {
      return executeComposition({ kind, children, run: (localContext) => run(children, localContext, config) }, context);
    }
  };
}

module.exports = {
  childContext, createCompositionOperator, executeComposition, runBridge, runCompete, runFederate,
  runGate, runNest, runParallel, runSequence, runWrap
};
