const crypto = require('crypto');
const telemetry = require('./telemetryObserver');
const modelRouter = require('./modelRouter');
const mcpExecutor = require('./mcpExecutor');
const { parseWorkflowCondition } = require('./workflowConditions');
const { validateGraph } = require('../controllers/workflowController');
const { MAX_WORKFLOW_NODES, MAX_WORKFLOW_DEPTH, MAX_PARALLEL_BRANCHES, MAX_WORKFLOW_DURATION_MS } = require('./jobWorkerState');
const { firstTruthy, firstNonNull, safeGet, codedError, parseJson, assertNotCancelled } = require('./jobWorkerSupport');

function assertWorkflowDeadline(context) {
  if (Date.now() > context.workflowDeadline) throw codedError(`Workflow exceeded its total deadline of ${context.workflowDeadline - context.started}ms.`, 'WORKFLOW_DEADLINE_EXCEEDED');
}

function clampDuration(value) {
  return Math.max(1, Math.min(value, MAX_WORKFLOW_DURATION_MS));
}

function checkpointNodes(checkpoint) {
  return Array.isArray(checkpoint.completedNodes) ? checkpoint.completedNodes : [];
}

function checkpointOutput(checkpoint) {
  return checkpoint.output && typeof checkpoint.output === 'object' ? { ...checkpoint.output } : {};
}

async function loadRunnableWorkflow(db, run) {
  await assertNotCancelled(db, 'workflow_runs', { id: run.id, message: 'Workflow run was cancelled.', code: 'WORKFLOW_CANCELLED' });
  const workflow = await db.get(
    `SELECT w.*, v.graph_json AS version_graph_json, v.metadata_json AS version_metadata_json
      FROM workflows w LEFT JOIN workflow_versions v ON v.workflow_id = w.id AND v.version = ?
      WHERE w.id = ?`,
    run.workflow_version, run.workflow_id
  );
  if (!workflow) throw new Error('Workflow no longer exists.');
  if (!['staging', 'published'].includes(workflow.status)) throw new Error(`Workflow status '${workflow.status}' is not runnable.`);
  const graph = JSON.parse(firstTruthy(workflow.version_graph_json, workflow.graph_json, '{"nodes":[],"edges":[]}'));
  if ((graph.nodes || []).length > MAX_WORKFLOW_NODES) throw new Error(`Workflow exceeds the ${MAX_WORKFLOW_NODES}-node execution limit.`);
  const validation = validateGraph(graph);
  if (!validation.valid) throw new Error(`Workflow graph is invalid: ${validation.errors.join(' ')}`);
  return { workflow, graph };
}

function createWorkflowContext(db, run, loaded) {
  const { workflow, graph } = loaded;
  const checkpoint = parseJson(run.output_json);
  const started = Date.now();
  const metadata = parseJson(firstTruthy(workflow.version_metadata_json, workflow.metadata_json));
  const requestedDuration = Number(firstNonNull(run.timeout_ms, metadata.workflowTimeoutMs, metadata.timeoutMs, MAX_WORKFLOW_DURATION_MS));
  const duration = Number.isFinite(requestedDuration) ? clampDuration(requestedDuration) : MAX_WORKFLOW_DURATION_MS;
  return {
    db,
    run,
    workflow,
    graph,
    input: JSON.parse(run.input_json || '{}'),
    output: checkpointOutput(checkpoint),
    visited: new Set(checkpointNodes(checkpoint)),
    skipped: new Set(),
    traceId: `trace-${run.id}`,
    started,
    workflowDeadline: started + duration,
    token: run.claim_token,
    nodes: new Map((graph.nodes || []).map((node) => [node.id, node])),
    edges: graph.edges || []
  };
}

function resolveTemplate(template, context) {
  return String(template || '').replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key) => key.split('.').reduce((value, part) => value == null ? '' : value[part], context) ?? '');
}

function shouldRun(node, input) {
  const condition = firstTruthy(node.when, safeGet(node.data, 'when'));
  try {
    return parseWorkflowCondition(condition)(input);
  } catch (_) {
    throw new Error(`Unsupported workflow condition on node ${node.id}.`);
  }
}

function nextNodes(context, node) {
  return context.edges.filter((edge) => edge.source === node.id).map((edge) => context.nodes.get(edge.target)).filter(Boolean);
}

function nodeKind(node) {
  return firstTruthy(node.kind, safeGet(node.data, 'kind'), node.type, safeGet(node.data, 'label'), '');
}

function isLlmKind(kind) {
  return /\b(llm|agent|model)\b/i.test(kind);
}

function runScope(context, field) {
  return firstTruthy(context.run[field], context.workflow[field], null);
}

function depthOf(options) {
  return options.depth || 0;
}

function childOptions(options, patch) {
  return { ...options, ...patch };
}

function assertDepth(depth) {
  if (depth > MAX_WORKFLOW_DEPTH) throw new Error(`Workflow exceeds the ${MAX_WORKFLOW_DEPTH}-level execution depth limit.`);
}

async function runLlmNode(context, node) {
  const model = firstTruthy(node.model, safeGet(node.data, 'model'));
  const promptTemplate = firstTruthy(node.prompt, safeGet(node.data, 'prompt'), `Execute the workflow step: ${String(firstTruthy(safeGet(node.data, 'label'), node.id))}`);
  const generated = await modelRouter.generate({
    db: context.db,
    agentId: firstTruthy(node.agentId, safeGet(node.data, 'agentId'), node.id),
    model,
    prompt: resolveTemplate(promptTemplate, {
      input: context.input,
      workflow: { id: context.workflow.id, name: context.workflow.name },
      node: node.data || {},
      outputs: context.output
    }),
    timeoutMs: Math.min(Number(firstTruthy(node.timeout_ms, safeGet(node.data, 'timeoutMs'), 30000)), Math.max(1, context.workflowDeadline - Date.now())),
    policy: firstTruthy(node.modelRouting, safeGet(node.data, 'modelRouting')),
    requiredCapabilities: firstTruthy(node.requiredCapabilities, safeGet(node.data, 'requiredCapabilities'), []),
    onToken: (token, selectedModel) => telemetry.emitEvent({ eventType: 'WORKFLOW_MODEL_TOKEN', agentId: node.id, action: 'MODEL_TOKEN', detail: token, payload: { runId: context.run.id, traceId: context.traceId, nodeId: node.id, model: selectedModel } })
  });
  return { status: 'completed', model: generated.model, provider: generated.provider, text: generated.text, inputTokens: generated.inputTokens, outputTokens: generated.outputTokens, route: generated.route };
}

async function runLoopNode(context, node, options) {
  const configured = firstNonNull(node.max_iterations, safeGet(node.data, 'maxIterations'), 3);
  const count = Number(configured);
  if (!Number.isInteger(count) || count < 0 || count > 20) throw new Error(`Invalid maxIterations for node ${node.id}.`);
  const children = nextNodes(context, node);
  for (let iteration = 0; iteration < count; iteration++) {
    context.output[`${node.id}.${iteration}`] = { iteration };
    for (const child of children) await runNode(context, child, { depth: depthOf(options) + 1, force: true, iteration });
  }
  return { nodeOutput: { status: 'completed', iterations: count }, childrenHandled: true };
}

async function runToolNode(context, node) {
  const toolName = firstTruthy(node.tool, safeGet(node.data, 'tool'), safeGet(node.data, 'toolName'), 'genos_inspect');
  const toolResult = await mcpExecutor.execute({
    agentId: firstTruthy(node.agentId, safeGet(node.data, 'agentId'), node.id),
    organizationId: runScope(context, 'organization_id'),
    projectId: runScope(context, 'project_id'),
    toolName,
    args: firstTruthy(node.args, safeGet(node.data, 'args'), {}),
    taints: firstTruthy(node.taints, [])
  });
  if (!toolResult.success) throw new Error(firstTruthy(toolResult.error, safeGet(toolResult.policy, 'reason'), `MCP tool '${toolName}' is unavailable (${firstTruthy(toolResult.status, 'unknown status')}).`));
  return { ...toolResult, tool: toolName, toolCall: true };
}

async function runParallelNode(context, node, options) {
  const branches = nextNodes(context, node);
  if (branches.length > MAX_PARALLEL_BRANCHES) throw new Error(`Parallel node ${node.id} exceeds the ${MAX_PARALLEL_BRANCHES}-branch fan-out limit.`);
  await Promise.all(branches.map((branch) => runNode(context, branch, { depth: depthOf(options) + 1 })));
  return { status: 'completed', parallelBranches: branches.length };
}

async function executeNodeWork(context, node, options) {
  const kind = nodeKind(node);
  let nodeOutput = { status: 'completed' };
  let childrenHandled = false;
  if (isLlmKind(kind)) nodeOutput = await runLlmNode(context, node);
  if (/loop/i.test(kind)) {
    const loop = await runLoopNode(context, node, options);
    nodeOutput = loop.nodeOutput;
    childrenHandled = loop.childrenHandled;
  }
  if (/tool/i.test(kind)) nodeOutput = await runToolNode(context, node);
  if (/parallel/i.test(kind)) nodeOutput = await runParallelNode(context, node, options);
  return { nodeOutput, childrenHandled };
}

async function persistCheckpoint(context) {
  const payload = JSON.stringify({ traceId: context.traceId, completedNodes: [...context.visited], skippedNodes: [...context.skipped], output: context.output });
  const result = await context.db.run("UPDATE workflow_runs SET output_json = ?, claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running' AND claim_token = ?", payload, context.run.id, context.token);
  if (result.changes === 1) return;
  const state = await context.db.get('SELECT status FROM workflow_runs WHERE id = ?', context.run.id);
  const cancelled = state?.status === 'cancelled';
  throw codedError(cancelled ? 'Workflow run was cancelled.' : 'Workflow checkpoint could not be persisted.', cancelled ? 'WORKFLOW_CANCELLED' : 'WORKFLOW_CHECKPOINT_CONFLICT');
}

async function recordSuccessSpan(context, node, span) {
  await context.db.run(
    'INSERT INTO trace_spans (id, trace_id, agent_id, name, start_time, inputs_json, outputs_json, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    span.id, context.traceId, node.id, `workflow.${node.id}`, span.start,
    JSON.stringify(context.input), JSON.stringify(context.output[node.id]),
    runScope(context, 'organization_id'), runScope(context, 'project_id')
  );
  await context.db.run('UPDATE trace_spans SET end_time = ? WHERE id = ?', Date.now(), span.id);
  telemetry.emitEvent({ eventType: 'WORKFLOW_NODE_COMPLETED', agentId: node.id, action: 'WORKFLOW_STEP', detail: `Completed workflow node ${node.id}`, payload: { runId: context.run.id, traceId: context.traceId, nodeId: node.id } });
}

async function recordFailureSpan(context, node, failure) {
  const failedOutput = { status: 'failed', error: failure.error.message };
  await context.db.run(
    'INSERT INTO trace_spans (id, trace_id, agent_id, name, start_time, end_time, inputs_json, outputs_json, error, organization_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    failure.span.id, context.traceId, node.id, `workflow.${node.id}`, failure.span.start, Date.now(),
    JSON.stringify(context.input), JSON.stringify(failedOutput), failure.error.message,
    runScope(context, 'organization_id'), runScope(context, 'project_id')
  );
  telemetry.emitEvent({ eventType: 'WORKFLOW_NODE_FAILED', agentId: node.id, action: 'WORKFLOW_STEP', detail: failure.error.message, severity: 'error', payload: { runId: context.run.id, traceId: context.traceId, nodeId: node.id } });
}

async function executeNode(context, node, options) {
  context.visited.add(node.id);
  const span = { id: `span-${crypto.randomUUID()}`, start: Date.now() };
  const kind = nodeKind(node);
  let nodeOutput = { status: 'completed' };
  let childrenHandled = false;
  try {
    const result = await executeNodeWork(context, node, options);
    nodeOutput = result.nodeOutput;
    childrenHandled = result.childrenHandled;
    context.output[node.id] = nodeOutput;
    await persistCheckpoint(context);
    await recordSuccessSpan(context, node, span);
  } catch (error) {
    context.output[node.id] = { status: 'failed', error: error.message };
    await recordFailureSpan(context, node, { span, error });
    throw error;
  }
  assertWorkflowDeadline(context);
  if (!childrenHandled && !/parallel/i.test(kind)) {
    for (const child of nextNodes(context, node)) await runNode(context, child, childOptions(options, { depth: depthOf(options) + 1, blocked: false }));
  }
}

async function resumeVisited(context, node, options) {
  for (const child of nextNodes(context, node)) await runNode(context, child, childOptions(options, { depth: depthOf(options) + 1, blocked: false }));
}

async function skipNode(context, node, options) {
  context.skipped.add(node.id);
  context.output[node.id] = { status: 'skipped', reason: 'condition_not_satisfied' };
  for (const child of nextNodes(context, node)) await runNode(context, child, childOptions(options, { depth: depthOf(options) + 1, blocked: true }));
}

async function runNode(context, node, options = {}) {
  assertWorkflowDeadline(context);
  assertDepth(depthOf(options));
  await assertNotCancelled(context.db, 'workflow_runs', { id: context.run.id, message: 'Workflow run was cancelled.', code: 'WORKFLOW_CANCELLED' });
  if (!node || (!options.force && context.skipped.has(node.id))) return;
  if (!options.force && context.visited.has(node.id)) {
    await resumeVisited(context, node, options);
    return;
  }
  if (options.blocked || !shouldRun(node, context.input)) {
    await skipNode(context, node, options);
    return;
  }
  await executeNode(context, node, options);
}

function entryNodes(context) {
  const roots = (context.graph.nodes || []).filter((node) => !context.edges.some((edge) => edge.target === node.id));
  if (roots.length) return roots;
  return (context.graph.nodes || []).slice(0, 1);
}

function reachableNodes(context, entries) {
  const reachable = new Set();
  const pending = [...entries];
  while (pending.length) {
    const node = pending.pop();
    if (!node || reachable.has(node.id)) continue;
    reachable.add(node.id);
    for (const edge of context.edges.filter((candidate) => candidate.source === node.id)) pending.push(context.nodes.get(edge.target));
  }
  return reachable;
}

function markUnreachableSkipped(context) {
  const reachable = reachableNodes(context, entryNodes(context));
  const unreachable = (context.graph.nodes || []).filter((node) => !reachable.has(node.id)).map((node) => node.id);
  if (unreachable.length > 0) throw new Error(`Workflow contains unreachable nodes: ${unreachable.join(', ')}`);
  for (const node of context.graph.nodes || []) {
    if (reachable.has(node.id) && !context.visited.has(node.id) && !context.skipped.has(node.id)) {
      context.skipped.add(node.id);
      context.output[node.id] = { status: 'skipped', reason: 'ancestor_skipped' };
    }
  }
}

async function runWorkflowRoots(context) {
  for (const root of entryNodes(context)) await runNode(context, root, {});
}

async function finishWorkflow(context) {
  await assertNotCancelled(context.db, 'workflow_runs', { id: context.run.id, message: 'Workflow run was cancelled.', code: 'WORKFLOW_CANCELLED' });
  const payload = JSON.stringify({ ok: true, traceId: context.traceId, nodes: context.visited.size, skippedNodes: [...context.skipped], output: context.output });
  const completion = await context.db.run("UPDATE workflow_runs SET status = ?, output_json = ?, started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running' AND claim_token = ?", 'completed', payload, context.run.id, context.token);
  if (!completion.changes) throw codedError('Workflow run changed state before completion.', 'WORKFLOW_STATE_CHANGED');
}

async function executeWorkflow(db, run) {
  const loaded = await loadRunnableWorkflow(db, run);
  const context = createWorkflowContext(db, run, loaded);
  await runWorkflowRoots(context);
  markUnreachableSkipped(context);
  await finishWorkflow(context);
}

module.exports = { executeWorkflow };
