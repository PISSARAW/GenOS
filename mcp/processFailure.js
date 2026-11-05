function failureEnvelope(text) {
  let value;
  try { value = JSON.parse(text); } catch { return null; }
  return value?.schema === 'genos.a-team-dispatch-result/v1' && value.success === false
    && value.error?.code === 'A_TEAM_TERMINAL_FAILURE' && typeof value.error.message === 'string'
    && value.aTeam?.terminal === true && value.aTeam.accepted === false
    && ['blocked', 'failed'].includes(value.aTeam.status)
    ? value : null;
}

export function processFailure(input) {
  const error = new Error(`Process exited with code ${input.code}: ${input.stderr || input.stdout}`);
  error.exitCode = input.code;
  const envelope = failureEnvelope(input.stdout);
  if (envelope) { error.failureEnvelope = envelope; error.code = envelope.error.code; }
  return error;
}

export function failureText(error) {
  return error.failureEnvelope ? JSON.stringify(error.failureEnvelope) : error.message;
}
