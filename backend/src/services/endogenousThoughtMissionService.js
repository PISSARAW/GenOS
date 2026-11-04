'use strict';

const contract = require('./endogenousThoughtMissionContract');
const authority = require('./endogenousThoughtMissionAuthority');
const sandbox = require('./endogenousThoughtMissionSandbox');
const store = require('./endogenousThoughtMissionStore');
const thoughtStore = require('./endogenousThoughtStoreService');

function identity(input) {
  return contract.digest({ organizationId: input.organizationId, projectId: input.projectId,
    missionId: input.missionId, agentId: input.agentId, artifact: input.artifact,
    requirements: input.requirements });
}
async function observation(db, input, measured) {
  const summary = `Inspection structurelle de sha256:${input.artifact.sha256} : ${JSON.stringify(measured.metrics)}. `
    + 'Ces mesures ne jugent ni la dramaturgie ni la qualité artistique.';
  const value = { id: `ett-mission:${identity(input).slice(0, 40)}`, projectId: input.projectId,
    domain: 'artifact-inspection', dimension: input.dimension,
    kind: measured.metrics.missing.length ? 'degradation' : 'opportunity', epistemicStatus: 'observed',
    source: `native-inspection:${measured.programDigest}`, summary,
    observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + input.budget.seconds * 1000).toISOString(),
    evidenceRefs: [`sha256:${input.artifact.sha256}`, `ett-inspection:${contract.digest(measured)}`, input.missionId] };
  const responsibility = await require('./shev/responsibilityService').getResponsibility(db, input.projectId);
  if (responsibility.mandate.endogenousPolicy?.enabled) throw contract.fail('ETT_MISSION_OBSERVER_ENROLLMENT_REQUIRED');
  return require('./shev/observationService').recordObservation(db, value);
}
async function detect(db, input, snapshot) {
  const measured = sandbox.measure(snapshot, input.executionDeadlineAt);
  const observed = await observation(db, input, measured);
  const framing = input.questionGenerator ? await input.questionGenerator({ observation: observed,
    measurement: measured, requirements: input.requirements, budget: input.budget }) : null;
  const question = contract.question(input, typeof framing === 'string' ? framing : framing?.text);
  const result = await require('./endogenousThoughtDetectionService').detectAndQuestion(db, {
    ...input, observationId: observed.id,
    policy: { enabled: true, id: 'ett-mission-structure-detection/v1', condition: 'full',
      cooldownMs: 0, maxOpenEpisodes: 1, maxBudget: input.budget },
    questionGenerator: async () => question });
  if (result.status !== 'questioned') throw contract.fail('ETT_MISSION_DETECTION_REFUSED', result.reason);
  if (result.question.receipt.payload.hypothesis !== question.hypothesis) throw contract.fail('ETT_MISSION_HYPOTHESIS_CHANGED');
  return { result, measured, observation: observed };
}
function learnedCycle(result) {
  const cycle = result.cycles.find(item => item.learning?.learning?.receipt);
  if (result.episode.currentState !== 'STOPPED' || !cycle) throw contract.fail('ETT_MISSION_LOOP_INCOMPLETE');
  if (!cycle.learning.learning.receipt.payload.revision.applied || !cycle.learning.memory?.productionMemoryMutated) {
    throw contract.fail('ETT_MISSION_LEARNING_REQUIRED');
  }
  return cycle;
}
async function finish(db, input, context) {
  const cycle = learnedCycle(context.loop);
  if (Date.now() - context.startedAt > input.budget.seconds * 1000) throw contract.fail('ETT_MISSION_TIME_EXCEEDED');
  contract.snapshot(input, await contract.assertOwner(db, input));
  const proof = context.verification.proofs.at(-1);
  if (!proof) throw contract.fail('ETT_MISSION_EXECUTION_PROOF_REQUIRED');
  const body = { schema: 'genos.ett-mission-structure/v1', receiptId: `ett-mission-${identity(input)}`,
    organizationId: input.organizationId, projectId: input.projectId, missionId: input.missionId, agentId: input.agentId,
    artifact: input.artifact, requirements: input.requirements, episodeId: input.episodeId,
    terminalState: context.loop.episode.currentState, hypothesis: contract.hypothesis(input),
    verdict: cycle.verification.verification.receipt.payload.verdict,
    verifiedFindings: proof.oracle.metrics, proof, observation: context.detection.observation,
    receiptRefs: { question: context.detection.result.question.receipt.receiptId,
      run: cycle.run.run.receipt.receiptId, verification: cycle.verification.verification.receipt.receiptId,
      learning: cycle.learning.learning.receipt.receiptId, stopped: context.loop.episode.currentReceiptId,
      memory: cycle.learning.memory.memoryRef },
    memoryDigest: cycle.learning.memory.contentDigest,
    usage: { tokens: 0, usd: 0, seconds: Math.ceil((Date.now() - context.startedAt) / 1000) },
    executionUsage: context.loop.cumulativeUsage, recordedAt: new Date().toISOString(),
    boundaries: { artisticQualityVerified: false, causalImprovementVerified: false, promotionEligible: false,
      executionKind: 'fixed-read-only-structural-programs', questionModelUsageIncluded: false,
      memoryIndexMode: 'local-lexical' } };
  return store.put(db, body);
}
async function run(db, rawInput) {
  const startedAt = Date.now(), input = contract.normalize(rawInput);
  input.executionDeadlineAt = startedAt + input.budget.seconds * 1000;
  const owner = await contract.assertOwner(db, input);
  await authority.assertEnrolled(db, input);
  const snapshot = contract.snapshot(input, owner);
  const detection = await detect(db, input, snapshot);
  input.episodeId = detection.result.episode.receipt.payload.episodeId;
  const runtime = sandbox.create(snapshot, input.executionDeadlineAt), verification = authority.verifier(input, runtime, snapshot);
  const loop = await require('./endogenousThoughtLoopService').runAutonomousLoop(db, {
    ...input, maxCycles: 1, useWallClock: true, memoryIndexMode: 'local-lexical',
    authorize: authority.signer(input), verify: verification.verify, grantedBy: input.authority.grantedBy,
    worker: runtime.worker, sandbox: runtime.sandbox, usageMeter: runtime.usageMeter,
    policies: { admission: { ttlMs: Math.min(3600000, input.budget.seconds * 1000) } } });
  return finish(db, input, { loop, detection, verification, startedAt });
}
async function assertReceipts(db, record) {
  await require('./endogenousThoughtMissionEvidence').verify(db, record);
  const receipts = await thoughtStore.listReceipts(db, record);
  const states = receipts.map(item => item.receipt.payload.toState);
  for (const state of ['QUESTIONED', 'ADMITTED', 'QUEUED', 'RUNNING', 'VERIFIED', 'LEARNED', 'STOPPED']) {
    if (!states.includes(state)) throw contract.fail('ETT_MISSION_LOOP_INCOMPLETE');
  }
  if (receipts.at(-1).receipt.receiptId !== record.receiptRefs.stopped) throw contract.fail('ETT_MISSION_RECEIPT_CHANGED');
  const memory = await db.get(`SELECT content FROM genome_decisions WHERE id=? AND created_by=?
    AND organization_id=? AND project_id=?`, record.receiptRefs.memory, record.agentId, record.organizationId, record.projectId);
  if (!memory || contract.bytesDigest(memory.content) !== record.memoryDigest) throw contract.fail('ETT_MISSION_MEMORY_CHANGED');
  return receipts;
}
async function read(db, input) {
  const record = await store.get(db, input);
  const owner = await contract.assertOwner(db, record, { historical: true });
  contract.snapshot(record, owner);
  await assertReceipts(db, record);
  return record;
}
async function buildContext(db, input) {
  const record = await read(db, input);
  await contract.assertOwner(db, record);
  return { receiptId: record.receiptId, sourceRefs: Object.values(record.receiptRefs),
    contextText: `ETT — inspection structurelle vérifiée, limitée au texte sha256:${record.artifact.sha256}.\n`
      + `Constats mesurés : ${JSON.stringify(record.verifiedFindings)}.\n`
      + `Exigences : ${JSON.stringify(record.requirements)}.\n`
      + `Reçu : ${record.receiptId}. Aucune qualité artistique ou amélioration causale n’est certifiée.`,
    artifactDigest: record.artifact.sha256, requirementsDigest: contract.digest(record.requirements) };
}

module.exports = { run, read, buildContext };
