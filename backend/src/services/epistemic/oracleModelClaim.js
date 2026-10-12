'use strict';

const { createFormalResult } = require('../formalResultService');
const subjectStore = require('./oracleModelSubject');

function build(input) {
  const { subject, workspaceRoot } = input;
  const producer = { model: 'measured-route-output', version: '1', actorId: subject.workerId,
    strategy: 'model-subset-candidate', workspaceId: workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjectStore.STATEMENT, status: 'tested',
    assumptions: [], validityDomain: subjectStore.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:model-subset-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'model-attempt', uri: `genos://attempts/${subject.content.modelOutput.routeAttemptId}`,
        digest: subject.content.modelOutput.digest }, inputs: [],
      transformations: ['observed-model-output-to-independent-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer };
}

module.exports = { build };
