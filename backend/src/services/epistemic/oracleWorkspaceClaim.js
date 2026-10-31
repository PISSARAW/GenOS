'use strict';

const { createFormalResult } = require('../formalResultService');
const subjectStore = require('./oracleWorkspaceSubject');

function build({ subject, workspaceRoot }) {
  const formal = createFormalResult({ canonicalStatement: subjectStore.STATEMENT,
    status: 'tested', assumptions: [], validityDomain: subjectStore.DOMAIN, dependencies: [],
    producer: { model: 'genos-workspace-postconditions', version: '1',
      actorId: subject.workerId, strategy: 'sealed-source-postconditions', workspaceId: workspaceRoot },
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:workspace-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'sealed-worker-run', uri: `genos://runs/${subject.runId}`,
        digest: `sha256:${subject.contentHash}` }, inputs: [],
      transformations: ['sealed-sources-to-independent-postcondition-checks'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    epitopes: { evidence: { digest: formal.evidence.digest } }, producer: formal.producer };
}

module.exports = { build };
