'use strict';

const budget = require('./workerEvidenceBarrierLocalBudget');
const KINDS = ['scout_cell', 'bounded_worker', 'adaptive_worker', 'verifier_worker'];

function enabled(mission) {
  return mission.workerKind === 'sub_orchestrator' && mission.workerContract?.authority?.delegate === true;
}

function planFormat(maxChildren) {
  return { name: 'genos_local_delegation_plan', schema: { type: 'object', additionalProperties: false,
    required: ['children'], properties: { children: { type: 'array', minItems: 1, maxItems: maxChildren,
      items: { type: 'object', additionalProperties: false, required: ['workerKind', 'mission', 'modelTokens', 'mode', 'dependsOn'],
        properties: { workerKind: { enum: KINDS }, mission: { type: 'string', minLength: 1, maxLength: 12000 },
          modelTokens: { type: 'integer', minimum: 512, maximum: 10000 }, mode: { enum: ['analysis', 'code', 'review'] },
          dependsOn: { type: 'integer', minimum: -1, maximum: 4 } } } } } } };
}

function checkPlan(plan, contract) {
  if (!Array.isArray(plan?.children) || !plan.children.length || plan.children.length > contract.spawnBudget) throw failure('Invalid delegation child count.');
  let total = 0;
  for (const [index, child] of plan.children.entries()) {
    validateChild(child);
    validateDependency(child, index, plan.children);
    total += child.modelTokens;
  }
  if (total > contract.limits.maxTokens) throw failure('Delegation token ceiling exceeded.');
  return plan.children;
}

function validateChild(child) {
  if (!KINDS.includes(child.workerKind) || typeof child.mission !== 'string' || !child.mission.trim()
    || !Number.isSafeInteger(child.modelTokens) || child.modelTokens < 512) throw failure('Invalid delegation child.');
}

function validateDependency(child, index, children) {
  if (!['analysis', 'code', 'review'].includes(child.mode) || !Number.isInteger(child.dependsOn)
    || child.dependsOn < -1 || child.dependsOn >= index) throw failure('Invalid child dependency.');
  if (child.mode === 'review' && (child.workerKind !== 'verifier_worker' || child.dependsOn < 0)) throw failure('Review needs an earlier code child.');
  if (child.mode === 'review' && children[child.dependsOn]?.mode !== 'code') throw failure('Review source must be a code child.');
}

function failure(message) { return Object.assign(new Error(message), { code: 'LOCAL_DELEGATION_PLAN_INVALID' }); }

async function childEvidence(ctx, child, observed) {
  const request = { ...child, sourceChildId: child.dependsOn < 0 ? undefined : observed[child.dependsOn]?.childId };
  const result = await require('./agents/subOrchestratorDispatchService').dispatchLocalModelChild(ctx.db, ctx, request);
  const run = await ctx.db.get('SELECT id FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const receipt = run && await require('./biologicalWorkerStore').receipt(ctx.db, run.id);
  return { childId: result.childAgentId, runId: run?.id || null, status: result.status,
    verified: receipt?.result?.verified === true,
    evidence: receipt ? [`genos://worker-receipt/${receipt.receiptId}`] : (run ? [`genos://worker-run/${run.id}`] : []),
    report: result.supervision?.evidenceReport || null, error: result.supervision?.error || result.supervision?.code || null };
}

function synthesisContext(ctx, planResult, children) {
  const refs = children.flatMap(child => child.evidence);
  ctx.mission.allowedEvidenceRefs = [...new Set([...(ctx.mission.allowedEvidenceRefs || ['mission']), ...refs])];
  const promptText = `${ctx.promptText}\n\nPERSISTED CHILD EXECUTIONS:\n${JSON.stringify(children)}\nOnly these children ran. Cite their actual receipt references. A child with verified=false is not independently verified. Never claim a missing child, test, edit or acknowledgment. Report unresolved when requested work is incomplete. Return the normal worker evidence schema.`;
  const remaining = Number(ctx.mission.executionBudget.tokens) - budget.consumedTokensOf(planResult);
  budget.throwIfPromptOverBudget(budget.estimatePromptTokens(promptText), remaining);
  const latencyMs = ctx.delegationDeadline - Date.now();
  if (latencyMs <= 0) throw failure('Delegation synthesis deadline exhausted.');
  return { ...ctx, promptText, latencyMs, maxTokens: budget.resolveMaxOutputTokens(remaining, promptText) };
}

function combineResults(plan, synthesis) {
  return { ...synthesis, inputTokens: Number(plan.inputTokens) + Number(synthesis.inputTokens),
    outputTokens: Number(plan.outputTokens) + Number(synthesis.outputTokens), costUsd: Number(plan.costUsd) + Number(synthesis.costUsd) };
}

function assertSynthesis(result, observed) {
  const report = JSON.parse(result.text);
  if (report.outcome !== 'success') return;
  const summaries = report.childSummaries;
  if (!Array.isArray(summaries) || summaries.length !== observed.length) throw failure('Synthesis omitted or invented children.');
  for (const child of observed) {
    const matches = summaries.filter(item => item.childId === child.childId);
    if (matches.length !== 1 || matches[0].evidence.some(ref => !child.evidence.includes(ref))) throw failure('Synthesis child references differ from persisted receipts.');
    if (matches[0].outcome === 'success' && child.report?.outcome !== 'success') throw failure('Synthesis claimed a failed child succeeded.');
  }
}

async function generate(ctx, generateOnce) {
  ctx = { ...ctx, delegationDeadline: Date.now() + (ctx.latencyMs || ctx.mission.timeoutMs || 60000) };
  const contract = ctx.mission.workerContract;
  await require('./missionEnvelopeAuthority').assertRun(ctx.db, { agentId: ctx.mission.agentId, runId: ctx.executionRun.id, mission: ctx.mission });
  const planning = { ...ctx, maxTokens: Math.min(ctx.maxTokens, 1024),
    responseFormatOverride: planFormat(contract.spawnBudget),
    promptText: `${ctx.promptText}\n\nDELEGATION PLANNING PHASE: return only children with workerKind, mission, modelTokens, mode, dependsOn. Do not produce childSummaries yet. Use leaf workers only; total child modelTokens <= ${contract.limits.maxTokens}. mode is analysis, code (bounded_worker, requires existing write lease), or review (verifier_worker test-only). dependsOn=-1 means independent; review must refer to the zero-based index of an earlier code child whose tested files will be copied into the review capsule. Children use the same Qwen route. Never pretend tools ran.` };
  const plan = await generateOnce(planning);
  let result;
  try {
  if (plan.schemaViolation) throw failure('Delegation plan does not match its provider schema.');
  const children = checkPlan(JSON.parse(plan.text), contract);
  const observed = [];
  for (const child of children) observed.push(await childEvidence(ctx, child, observed));
  result = await generateOnce(synthesisContext(ctx, plan, observed));
  assertSynthesis(result, observed);
  return combineResults(plan, result);
  } catch (error) {
    const usage = result ? combineResults(plan, result) : plan;
    error.modelUsage = { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
      tokens: budget.consumedTokensOf(usage), cost_usd: usage.costUsd };
    throw error;
  }
}

module.exports = { enabled, generate, planFormat, checkPlan, combineResults };
