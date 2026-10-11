'use strict';
const { createFormalResult } = require('../formalResultService');
const subjectStore = require('./oracleWorkerSubject');

function build(input) {
  const { subject, workspaceRoot } = input;
  const producer = { model: `native-${subject.content.method.methodId}`, version: '1',
    actorId: subject.workerId, strategy: 'structured-worker', workspaceId: workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjectStore.STATEMENT, status: 'tested',
    assumptions: [], validityDomain: subjectStore.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:native-worker-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'node-worker', uri: `genos://runs/${subject.runId}`,
        digest: `sha256:${subject.bindingHash}` }, inputs: [],
      transformations: ['sealed-worker-result-to-native-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer };
}

module.exports = { build };
