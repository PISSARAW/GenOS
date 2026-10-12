'use strict';

const subjects = require('./oracleObservationSubject');
const { createFormalResult } = require('../formalResultService');

function build(input) {
  const { subject, workspaceRoot } = input;
  const spec = subjects.SPECS[subject.domain];
  const formal = createFormalResult({ canonicalStatement: spec.statement, status: 'tested',
    assumptions: [], validityDomain: spec.domain, dependencies: [],
    producer: { model: 'native-bounded-observation-checker', version: '1',
      actorId: subject.workerId, strategy: 'independent-fixture-recalculation', workspaceId: workspaceRoot },
    evidence: { kind: 'reproducible_artifact', content: { method: subject.method, result: subject.result },
      reproduction: { command: `genos:${subject.domain}-oracle`, environment: process.version } },
    provenance: { createdAt: new Date().toISOString(), actor: subject.workerId,
      source: { type: 'native-worker-run', uri: `genos://runs/${subject.runId}`,
        digest: `sha256:${subject.bindingHash}` }, inputs: [],
      transformations: ['sealed-observation-to-bounded-postconditions'] } });
  return { id: formal.resultId, claim: formal.canonicalStatement, formalResult: formal,
    producer: formal.producer, epitopes: { evidence: { digest: formal.evidence.digest } } };
}

module.exports = { build };
