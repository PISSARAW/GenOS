'use strict';

const { createFormalResult } = require('../formalResultService');
const subjectStore = require('./oracleProcedureSubject');

function build(input) {
  const { subject, workspaceRoot } = input;
  const producer = { model: 'native-map-subset-solver', version: '1', actorId: subject.content.workerId,
    strategy: 'reachable-map', workspaceId: workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjectStore.STATEMENT, status: 'tested',
    assumptions: [], validityDomain: subjectStore.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:native-subset-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.content.workerId,
      source: { type: 'node-worker', uri: `genos://runs/${subject.content.runId}`, digest: `sha256:${subject.bindingHash}` },
      inputs: [], transformations: ['sealed-worker-result-to-subset-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer };
}

module.exports = { build };
