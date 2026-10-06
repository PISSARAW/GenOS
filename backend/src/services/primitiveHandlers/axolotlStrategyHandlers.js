'use strict';
const service = require('../axolotlRegenerationService');
const store = require('../axolotlStateStore');
const topology = require('../axolotlTopologyService');
const observations = require('../axolotlObservationService');

async function normalized(context) {
  const db = context.db || await require('../../db').getDatabase();
  const orchestratorId = context.orchestratorId || context.orchestrator_id || context.agentId;
  await store.ensure(db);
  await store.assertOwner(db, orchestratorId);
  return { ...context, db, orchestratorId };
}
function safe(handler) {
  return async (context = {}) => {
    try { return await handler(context); }
    catch (failure) { return { success: false, code: failure.code || 'AXOLOTL_OPERATION_FAILED', error: failure.message }; }
  };
}
function skipped(context) {
  return context.regenerationAssessment?.needed === false ? { success: true, skipped: true, status: 'not_required' } : null;
}
async function assess(context) {
  if (!context.failureContext) throw store.error('STRATEGY_CONTEXT_INCOMPLETE');
  const assessment = await service.assessRegenerationNeed(context) || { needed: false, mode: 'no_action' };
  context.regenerationAssessment = assessment;
  if (!context.scope && assessment.scope) context.scope = assessment.scope;
  return { success: true, need_regeneration: assessment.needed, ...assessment };
}
async function plan(context) {
  if (skipped(context)) return skipped(context);
  const input = await normalized(context);
  const result = await service.planRegeneration(input);
  context.sessionId = result.sessionId;
  return result;
}
async function prepare(context) {
  if (skipped(context)) return skipped(context);
  const input = await normalized(context);
  return service.prepareCognitiveLearning(input.sessionId, input);
}
async function execute(context) {
  if (skipped(context)) return skipped(context);
  const input = await normalized(context);
  const result = await service.executeRegeneration({ db: input.db, sessionId: input.sessionId, context: input });
  if (result.success) context.topology = result.newTopology;
  return result;
}
async function validate(context) {
  if (skipped(context)) return skipped(context);
  const input = await normalized(context);
  if (!input.sessionId) throw store.error('AXOLOTL_FUNCTIONAL_EVIDENCE_REQUIRED');
  const session = await service.getRegenerationSession(input.sessionId, input);
  if (session.status !== 'completed') return { success: false, status: session.status, code: 'AXOLOTL_SESSION_NOT_COMPLETED' };
  const proof = await store.evidence(input.db, session.evidenceRef);
  const active = await store.activeTopology(input.db, input.orchestratorId);
  const passed = proof.result.passed && proof.subjectHash === store.hash(active.topology);
  return { success: passed, passed, sessionId: session.id, evidenceRef: session.evidenceRef, validation: proof.result };
}
async function promote(context) {
  if (skipped(context)) return skipped(context);
  const input = await normalized(context);
  const candidateId = input.candidateId || input.candidate_id;
  if (candidateId) return service.promoteCognitiveCandidate({ ...input, candidateId });
  const session = await service.getRegenerationSession(input.sessionId, input);
  const candidates = session.learning.candidates.filter((item) => item.status === 'supported_candidate');
  const promotions = [];
  for (const candidate of candidates) promotions.push(await service.promoteCognitiveCandidate({ ...input, candidateId: candidate.id }));
  return { success: true, promotions, status: promotions.length ? 'promoted' : 'not_requested' };
}
async function mutateMode(context) {
  const input = await normalized(context);
  const result = await require('../development/plasticityRegulatorService').requestChange({ ...input, id: input.orchestratorId });
  return { ...result, success: result.ok };
}
async function activeOperation(context, operation) {
  const input = await normalized(context);
  const active = await store.activeTopology(input.db, input.orchestratorId);
  if (!active) throw store.error('AXOLOTL_ACTIVE_TOPOLOGY_REQUIRED');
  const kernel = require('../axolotlRuntimeKernel');
  return { success: true, version: active.version, result: kernel[operation](active.topology, input) };
}
module.exports = {
  assess_regeneration: safe(assess), plan_regeneration: safe(plan), prepare_cognitive_learning: safe(prepare),
  execute_regeneration: safe(execute), validate_equivalence: safe(validate), promote_cognitive_candidate: safe(promote),
  inspect_regeneration: safe(async (context) => {
    const input = await normalized(context);
    return { success: true, session: await service.getRegenerationSession(input.sessionId, input) };
  }),
  rollback_regeneration: safe(async (context) => service.rollbackRegeneration(await normalized(context))),
  request_metamorphosis: safe(mutateMode),
  observe_axolotl: safe(async (context) => observations.observe(await normalized(context))),
  axolotl_cost_report: safe(async (context) => observations.costReport(await normalized(context))),
  axolotl_route: safe(async (context) => require('../axolotlMessageService').send(await normalized(context))),
  axolotl_inbox: safe(async (context) => require('../axolotlMessageService').receive(await normalized(context))),
  axolotl_recall: safe((context) => activeOperation(context, 'recall'))
};
