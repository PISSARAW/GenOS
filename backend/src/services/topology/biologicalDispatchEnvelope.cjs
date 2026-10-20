'use strict';

const SCHEMA = 'genos.biological-dispatch-result/v1';

function completionVerdict(result) {
  const declared = result?.completionContract?.verdict;
  if (['succeeded', 'partial', 'failed'].includes(declared)) return declared;
  if (result?.complete === true && result?.status === 'completed') return 'succeeded';
  return result?.status === 'failed' ? 'failed' : 'partial';
}

function build(input) {
  const result = input.output?.biologicalMode || input.output || {};
  const verdict = completionVerdict(result);
  const success = verdict === 'succeeded';
  return {
    schema: SCHEMA,
    missionId: input.missionId || null,
    topology: input.mode || result.mode || null,
    verdict,
    success,
    result: input.output,
    ...(success ? {} : { error: {
      code: 'BIOLOGICAL_MISSION_INCOMPLETE',
      message: `${input.mode || 'biological'} dispatch did not complete every required worker with valid evidence.`
    } })
  };
}

function incompleteError(envelope) {
  const error = new Error(envelope.error.message);
  error.code = envelope.error.code;
  error.exitCode = 2;
  error.stdoutEnvelope = envelope;
  return error;
}

module.exports = { SCHEMA, build, completionVerdict, incompleteError };
