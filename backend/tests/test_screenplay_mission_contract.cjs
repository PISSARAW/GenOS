'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const { buildWorkerMission } = require('../src/services/orchestratorDispatchService');
const { attachEnvelope } = require('../bin/directWorkerContext.cjs');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');
const team = require('../src/services/workerTeamContract');
const { compileQualityContract } = require('../src/services/qualityElevation/qualityContract');
const { configureFinalArtifact } = require('../src/services/qualityElevation/qualityFinalPlan');
const { evaluateArtifact } = require('../src/services/qualityElevation/qualityEvaluatorRegistry');

const handoff = { handoffId: 'author-dramaturg', digest: 'a'.repeat(64), version: 1,
  evidenceRefs: ['artifact:source'], artifactPayload: { candidate: 'Observed source text.' } };
const request = { handoffContext: [handoff], depends_on: ['author'], pipeline_stage: 1,
  success_criteria: ['brief_coverage'], workerArtifactContract: true };
const payload = workerLaunchPayload({ context: { request },
  member: { role: 'dramaturg', mission: 'Revise the delivered screenplay.' },
  workerId: 'consumer', parent: { workspace_root: process.cwd() } });
const envelope = attachEnvelope({ prompt: payload.mission, role: payload.role }, payload);
const mission = buildWorkerMission({ ...envelope, agentId: 'consumer', workerKind: 'creative_worker' });
assert.deepEqual(mission.handoffContext, [handoff]);
assert.deepEqual(mission.missionCriteria, ['brief_coverage']);
assert.deepEqual(mission.depends_on, ['author']);
assert.equal(mission.pipeline_stage, 1);
assert.equal(mission.workerContract.mission.workerArtifactContract, true);
assert.ok(mission.allowedEvidenceRefs.includes('artifact:source'));
const finalInstruction = mission.prompt.slice(mission.prompt.lastIndexOf('FINAL RESPONSE CONTRACT:'));
assert.ok(finalInstruction.includes('acceptanceEvaluations'));
assert.ok(finalInstruction.includes('integrationConstraints'));
assert.ok(finalInstruction.includes(handoff.digest));

const report = { outcome: 'success', claims: [{ statement: 'Inspected the source.', evidence: ['artifact:source'] }],
  workerArtifact: { type: 'creative_candidate', content: { candidate: 'A candidate.',
    assumptions: ['Fiction.'], falsificationTest: 'Compare to the brief.' }, provenance: { sourceRefs: ['artifact:source'] } },
  acceptanceEvaluations: [{ criterion: 'brief_coverage', passed: null, evidenceRefs: ['artifact:source'] }],
  integrationConstraints: ['Preserve the source events.'],
  handoffEvaluations: [{ handoffId: handoff.handoffId, digest: handoff.digest, version: 1,
    passed: true, evidenceRefs: ['artifact:source'] }] };
assert.doesNotThrow(() => team.assertReport(mission, report));
const nativeMission = { ...mission, workerContract: { ...mission.workerContract, qualityElevation: {} } };
assert.doesNotThrow(() => team.assertReport(nativeMission, report));
assert.throws(() => team.assertReport(nativeMission, { ...report, artifactText: '<ARTIFACT:script>Duplicate</ARTIFACT>' }),
  { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
const missingMetadata = structuredClone(report);
delete missingMetadata.workerArtifact.content.assumptions;
delete missingMetadata.workerArtifact.provenance;
assert.throws(() => team.assertReport(nativeMission, missingMetadata), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
assert.throws(() => team.assertReport(mission, { ...report, integrationConstraints: undefined }),
  { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
assert.throws(() => team.assertReport(mission, { ...report, handoffEvaluations: [
  { ...report.handoffEvaluations[0], digest: 'invented' }] }), { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION' });
const dossier = require('../src/services/workerDossierHandoffService');
assert.throws(() => dossier.attachReport(mission, { outcome: 'success', claims: [] }),
  { code: 'WORKER_INTEGRATION_EVIDENCE_REQUIRED' });
const rejected = { ...report, handoffEvaluations: [{ ...report.handoffEvaluations[0], passed: false }] };
assert.equal(dossier.attachReport(mission, rejected).handoffEvaluations[0].passed, false);

const quality = compileQualityContract({ mission: 'Ecrire un scenario complet avec dialogues.',
  domain: 'screenplay', policy: 'fast', minSceneCount: 2, maxSceneCount: 3,
  minBodyWords: 60, requireDialogue: true });
const outline = 'INT. SAS - NUIT\nAlain et Vera discutent.\nINT. COULOIR - NUIT\nIls sauvent la Terre.';
const evaluated = evaluateArtifact('screenplay', outline, { contract: quality });
assert.ok(evaluated.defects.some(item => item.code === 'DELIVERABLE_INCOMPLETE'));
assert.ok(evaluated.defects.some(item => item.code === 'DIALOGUE_MISSING'));
assert.ok(evaluateArtifact('screenplay', 'Le Dernier Sas', { contract: quality })
  .defects.some(item => item.code === 'SCREENPLAY_BODY_MISSING'));

const members = [{ memberId: 'author', role: 'literary_author', workerKind: 'creative_worker' },
  { memberId: 'reviewer', role: 'literary_critic', workerKind: 'verifier_worker', dependsOn: ['author'] },
  { memberId: 'integration', role: 'literary_author', workerKind: 'creative_worker', dependsOn: ['reviewer'] }];
const configured = configureFinalArtifact({ qualityElevation: quality, members });
assert.equal(configured.members[0].qualityElevation.digest, quality.digest);
assert.equal(configured.members[1].qualityElevation, undefined);
assert.equal(configured.members[2].qualityElevation.digest, quality.digest);
assert.throws(() => configureFinalArtifact({ qualityElevation: quality, members: members.slice(0, 2) }),
  { code: 'GQEL_FINAL_PRODUCER_KIND_INVALID' });
const record = require('../src/services/aTeam/teamRunStore').teamRunRecord({ members: [
  { ...members[0], methodContract: { version: 1, methodId: 'prompt_defined' }, workerArtifactContract: true }] });
assert.equal(record.members[0].workerKind, 'creative_worker');
assert.equal(record.members[0].workerArtifactContract, true);
assert.equal(record.members[0].methodContract.methodId, 'prompt_defined');
const morphology = require('../src/services/aTeam/morphologyPlanning').plan({ morphogenesis: true,
  mission: 'Write then revise the screenplay.', execution_budget: { tokens: 100000 } });
assert.equal(morphology.selectedTopology, 'a_team');
assert.equal(morphology.compositeExecution, false);
console.log('Screenplay content, native handoff propagation, producer kinds and morphology planning: PASS');
