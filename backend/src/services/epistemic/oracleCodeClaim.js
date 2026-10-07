'use strict';

const { createFormalResult } = require('../formalResultService');
const subjects = require('./oracleCodeSubject');

function build({ subject }) {
  const producer = { model: 'native-bounded-code-checker', version: '1', actorId: subject.workerId,
    strategy: 'code_remainder', workspaceId: subject.workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjects.STATEMENT, status: 'tested', assumptions: [],
    validityDomain: subjects.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:bounded-code-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'bounded-code-artifact', uri: `genos://code/${subject.content.artifact.contentHash}`,
        digest: `sha256:${subject.bindingHash}` }, inputs: [], transformations: ['workspace-artifact-to-bounded-code-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal, producer,
    epitopes: { evidence: { digest: formal.evidence.digest } } };
}

module.exports = { build };
