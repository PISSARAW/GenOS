'use strict';

const subjects = require('./oracleScoutSubject');
const { createFormalResult } = require('../formalResultService');
const values = require('../trinityProvenanceValues');

function build({ subject }) {
  const producer = { model: 'native-scout', version: '1', actorId: subject.workerId,
    strategy: 'literal-source-scan', workspaceId: subject.workspaceRoot };
  const formal = createFormalResult({ canonicalStatement: subjects.STATEMENT, status: 'tested',
    assumptions: [], validityDomain: subjects.DOMAIN, dependencies: [], producer,
    evidence: { kind: 'reproducible_artifact', content: subject.content,
      reproduction: { command: 'genos:native-scout-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'native-scout-run', uri: `genos://runs/${subject.runId}`,
        digest: `sha256:${values.digest(subject.bindingHash)}` },
      inputs: [], transformations: ['sealed-scout-report-to-literal-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal, producer,
    epitopes: { evidence: { digest: formal.evidence.digest } } };
}

module.exports = { build };
