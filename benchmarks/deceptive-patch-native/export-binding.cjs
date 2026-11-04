'use strict';

async function verify(db, {run, artifact}) {
  const provenance = require('../../backend/src/services/gvxMissionProvenance');
  const scope = await provenance.agentScope(db, run.agent_id);
  const attestation = await require('../../backend/src/services/epistemic/nativeOracleJournal')
    .read(db, {runId: run.id, scope, kind: 'attestation'});
  if (!attestation?.value.accepted) return {matched: false, reason: 'native_attestation_absent'};
  const saved = await require('../../backend/src/services/aeisAssemblyStore')
    .readAssembly(db, attestation.value.assemblyId, {historical: true});
  const sources = saved.evaluation.assembly.results[0]?.evidence.content.sources;
  if (!Array.isArray(sources) || !sources.length) return {matched: false, reason: 'attested_sources_absent'};
  const byPath = new Map(artifact.files.map(file => [file.path, file.hash]));
  const matched = sources.every(source => byPath.get(source.path) === source.sha256);
  return {matched, attestationHash: attestation.hash, files: sources.map(source => ({path: source.path, sha256: source.sha256}))};
}
module.exports = {verify};
