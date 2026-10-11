'use strict';

const subjects = require('./oracleMonitorSubject');
const values = require('../trinityProvenanceValues');
function build({ subject }) {
  const formal = require('../formalResultService').createFormalResult({
    canonicalStatement: subjects.STATEMENT, status: 'tested', assumptions: [],
    validityDomain: subjects.DOMAIN, dependencies: [],
    producer: { model: 'native-monitor', version: '1', actorId: subject.workerId,
      strategy: 'independent-sample-monitor', workspaceId: subject.workspaceRoot },
    evidence: { kind: 'reproducible_artifact', content: subject,
      reproduction: { command: 'genos:native-monitor-oracle', environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'native-monitor-run', uri: `genos://runs/${subject.runId}`,
        digest: `sha256:${values.digest(subject.bindingHash)}` }, inputs: [],
      transformations: ['sealed-monitor-report-to-sample-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    producer: { model: 'native-monitor', version: '1', actorId: subject.workerId,
      strategy: 'independent-sample-monitor', workspaceId: subject.workspaceRoot },
    epitopes: { evidence: { digest: formal.evidence.digest } } };
}
module.exports = { build };
