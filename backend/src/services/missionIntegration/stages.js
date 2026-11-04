'use strict';
const { digest, fail } = require('./contract');
const research = require('../endogenousThoughtMissionService');

function researchReference(input) {
  return { organizationId: input.parent.organization_id, projectId: input.parent.project_id,
    missionId: input.context.missionId, agentId: input.context.orchestratorId };
}
function researchInput(input) {
  return { ...researchReference(input), artifact: input.contract.artifact,
    requirements: input.contract.requirements, budget: input.contract.researchBudget,
    authority: { privateKey: process.env.GENOS_MISSION_RESEARCH_AUTHORITY_PRIVATE_KEY_PEM,
      grantedBy: process.env.GENOS_MISSION_RESEARCH_GRANTED_BY || 'operator:mission-mechanisms' },
    dimension: 'artifact_structure' };
}
async function runResearch(db, input) {
  const request = researchInput(input);
  const receiptId = `ett-mission-${digest({ ...researchReference(input),
    artifact: request.artifact, requirements: request.requirements })}`;
  let record;
  try { record = await research.read(db, { ...researchReference(input), receiptId }); }
  catch (error) {
    if (error.code !== 'ETT_MISSION_BINDING_NOT_FOUND') throw error;
    record = await research.run(db, request);
  }
  const context = await research.buildContext(db, { ...researchReference(input), receiptId: record.receiptId });
  if (record.terminalState !== 'STOPPED' || !record.receiptRefs.memory) throw fail('MISSION_MECHANISMS_RESEARCH_INCOMPLETE');
  return { record, context };
}
async function runEcology(db, input) {
  const findings = input.research.record.verifiedFindings;
  const axes = findings.missing.length ? findings.missing : ['preserve_verified_structure'];
  const nce = await require('../nceIntegrationService').enhanceMissionWithNCE({
    agentId: input.context.orchestratorId, prompt: input.context.task, domain: 'screenplay',
    budget: { tokens: 0 }, explorationDomains: axes.map(id => ({ id: `structure:${id}`, seenCount: 0 })),
    requiredCapabilities: ['creative_writing'],
    nceOptions: { curiosity: true, phenotype: true, reprMutation: false, exaptation: false,
      play: false, envCoev: false, culture: false } }, db);
  if (Object.keys(nce.errors).length || !nce.curiosity?.ranking.length || !nce.phenotype?.stateId) {
    throw fail('MISSION_MECHANISMS_NCE_INCOMPLETE');
  }
  const text = input.research.context.contextText + require('../ncePromptService').buildPromptEnrichment(nce);
  return { result: nce, contextText: text,
    scope: 'Native curiosity and persistent phenotype from measured structural findings; no causal ecology experiment claimed.' };
}
async function admitWorkspace(db, input) {
  const ctx = { db, agentId: input.context.orchestratorId,
    normalizedMission: { prompt: input.missionText, missionId: input.context.missionId } };
  await require('../agentRuntimeAdapter/missionPlanning').attachGlobalWorkspace(ctx);
  if (ctx.agow?.activation !== 'bounded' || !ctx.agow.accepted || !ctx.agow.modeReceipt?.receiptId) {
    throw fail('MISSION_MECHANISMS_AGOW_ADMISSION_REQUIRED');
  }
  return ctx.agow;
}
function contextBlock(text, reference) {
  return `\n\nGENOS VERIFIED MISSION CONTEXT ${reference}\n`
    + 'Les observations structurelles ci-dessous concernent l’artefact de référence exact. '
    + 'Elles ne certifient ni sa qualité artistique ni celle du nouveau livrable. '
    + 'Les contrats et gates de cette mission restent applicables.\n' + text;
}
module.exports = { researchReference, runResearch, runEcology, admitWorkspace, contextBlock };
