'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildLocalMission } = require('../bin/orchestratorWindowsLocalExecution.cjs');
const { buildWorkspaceContext } = require('../bin/localRuntimeWorkspaceContext.cjs');
const { bindWorkspaceEvidence } = require('../src/services/workerEvidenceReadOnlyWorkspace');
const { buildAnalysisPrompt } = require('../src/services/workerEvidenceLocalPrompt');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-readonly-evidence-'));
try {
  const source = 'const answer = 42;\n';
  fs.writeFileSync(path.join(root, 'answer.js'), source);
  const mission = buildLocalMission({ id: 'mcp_orchestrator_worker-1', enhancedPrompt: 'Review the source.',
    request: { workspaceRoot: root, readOnlyWorkspaceEvidence: true }, missionBudget: {},
    requestTimeoutMs: 30000, allowedCommands: [], allowFileEdits: false });
  assert.equal(mission.writeLease, false);
  assert.equal(mission.localCodeWorker, false);
  assert.equal(mission.readOnlyWorkspaceEvidence, true);
  const snapshot = buildWorkspaceContext(root);
  bindWorkspaceEvidence(mission, snapshot);
  const digest = require('crypto').createHash('sha256').update(source).digest('hex');
  assert.deepEqual(mission.readFileHashes, { 'answer.js': digest });
  assert.ok(mission.allowedEvidenceRefs.includes(`sha256:${digest}`));
  const prompt = buildAnalysisPrompt({ selfIntro: '', workerSelfBlock: '', conscienceBlock: '',
    workerInstruction: 'Cite evidence.', evidenceRule: 'Return JSON.', agentName: 'Worker',
    prompt: mission.prompt, workspaceContext: snapshot.text });
  assert.match(prompt, /const answer = 42/);
  assert.match(prompt, new RegExp(`sha256=${digest}`));
  assert.match(prompt, /no file edits are authorized/i);
  const response = require('../src/services/agents/workerArtifactResponseSchema')
    .workerArtifactResponseFormat(mission.workerKind, mission.allowedEvidenceRefs);
  assert.ok(JSON.stringify(response).includes(`sha256:${digest}`));
  const artifactReport = { fullText: JSON.stringify({ outcome: 'success',
    claims: [{ statement: 'The source declares answer as 42.', evidence: [`sha256:${digest}`] }],
    scopeCompletion: { scopeRef: 'mission', completedRefs: [`sha256:${digest}`] } }) };
  require('../src/services/workerEvidenceLocalArtifact').attachWorkerArtifact(artifactReport, {
    mission, agentName: 'Worker'
  });
  assert.deepEqual(artifactReport.workerArtifact.provenance.readFileHashes, { 'answer.js': digest });

  const emptyMission = { readOnlyWorkspaceEvidence: true, allowedEvidenceRefs: ['mission'] };
  bindWorkspaceEvidence(emptyMission, { text: '[no readable workspace files]', fileHashes: {} });
  assert.deepEqual(emptyMission.allowedEvidenceRefs, ['mission']);
  const defaultMission = buildLocalMission({ id: 'agent-2', enhancedPrompt: 'Review.', request: {},
    missionBudget: {}, requestTimeoutMs: 30000, allowedCommands: [], allowFileEdits: false });
  assert.equal(defaultMission.readOnlyWorkspaceEvidence, false);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('read-only worker workspace evidence: PASS');
