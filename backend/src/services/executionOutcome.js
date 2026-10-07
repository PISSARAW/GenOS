function extractSignalAndStderr({ options, args }) {
  const signal = typeof options === 'object' && options !== null ? options.signal : options;
  const stderr = typeof options === 'object' && options !== null ? (options.stderr || '') : (args[3] || '');
  return { signal, stderr: String(stderr).trim() };
}

function extractDomainExtra({ options, args, domainState }) {
  return (typeof options === 'object' && options !== null && options.domainVerdict) ? options : (args[4] || domainState || {});
}

function buildHaltedOutcome({ termination, code, signal, stderr }) {
  return { status: 'blocked', eventType: 'AGENT_HALTED', action: 'GUARDRAIL', severity: 'warning', task: `Runtime halted: ${termination.reason}`, detail: `Runtime halted by ${termination.kind}: ${termination.reason}`, payload: { code, signal, terminationKind: termination.kind, terminationReason: termination.reason, stderr } };
}

function buildSuccessOutcome({ explicitFailed, unverified, code, executionStatus, domainVerdict }) {
  const finalStatus = explicitFailed ? 'failed' : (unverified ? 'unverified' : 'completed');
  const finalEventType = explicitFailed ? 'AGENT_FAILED' : 'AGENT_COMPLETED';
  const severity = explicitFailed ? 'error' : (unverified ? 'warning' : 'info');
  return { status: finalStatus, eventType: finalEventType, action: 'COMPLETE', severity, task: 'Execution completed', detail: `Runtime completed (process: success, domain: ${domainVerdict}).`, payload: { code, executionStatus, domainVerdict } };
}

function buildErrorOutcome({ code, signal, stderr, executionStatus, lastError }) {
  return { status: 'error', eventType: 'AGENT_FAILED', action: 'ERROR', severity: 'error', task: `Runtime exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`, detail: `Runtime exited unsuccessfully${lastError ? `: ${lastError}` : '.'}`, payload: { code, signal, stderr, executionStatus, domainVerdict: 'failed' } };
}

function runtimeExitOutcome({ termination, code, options = {}, domainState = {} }) {
  const { signal, stderr } = extractSignalAndStderr({ options, args: arguments });
  const extra = extractDomainExtra({ options, args: arguments, domainState });
  const hasDomainFailure = Boolean(extra.hasDomainFailure);
  const unverified = Boolean(extra.unverified);
  const explicitFailed = extra.domainVerdict === 'failed' || hasDomainFailure;
  if (termination) return buildHaltedOutcome({ termination, code, signal, stderr });
  const executionStatus = code === 0 ? 'exit_zero' : 'exit_nonzero';
  let domainVerdict = 'completed';
  if (explicitFailed) domainVerdict = 'failed';
  else if (unverified) domainVerdict = 'unverified';
  if (code === 0) return buildSuccessOutcome({ explicitFailed, unverified, code, executionStatus, domainVerdict });
  const lastError = stderr.split(/\r?\n/).filter(Boolean).pop();
  return buildErrorOutcome({ code, signal, stderr, executionStatus, lastError });
}

module.exports = { runtimeExitOutcome, extractSignalAndStderr, extractDomainExtra, buildHaltedOutcome, buildSuccessOutcome, buildErrorOutcome };