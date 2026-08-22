const VALID_DECISIONS = new Set(['approved', 'approved_with_limitations', 'withheld', 'rejected']);

export function validateReport(report) {
  const errors = [];
  if (report.schema_version !== 'genos-benchmark-report-v1') errors.push('schema_version must be genos-benchmark-report-v1');
  if (!report.task_id || !report.benchmark_id) errors.push('task_id and benchmark_id are required');
  if (!VALID_DECISIONS.has(report.audit?.decision)) errors.push('audit.decision is invalid');
  if (!Array.isArray(report.evidence?.commands)) errors.push('evidence.commands must be an array');

  const failedCommands = (report.evidence?.commands || []).filter((command) => !command.passed);
  if (failedCommands.length && !['rejected', 'withheld'].includes(report.audit?.decision)) {
    errors.push('a report with failed commands cannot be approved');
  }

  if (report.public_benchmark) {
    if (typeof report.claim_allowed !== 'boolean') errors.push('public reports require claim_allowed');
    if (!report.claim_allowed && report.score !== null) errors.push('a withheld public claim must have score=null');
    if (report.execution_status === 'blocked_external_dependency' && report.sample_size !== 0) {
      errors.push('a blocked public benchmark must have sample_size=0');
    }
  }

  for (const metric of report.metrics || []) {
    if (metric.status === 'unsupported' && metric.value !== null) {
      errors.push(`unsupported metric ${metric.name} must have value=null`);
    }
  }
  return errors;
}

export function assertValidReport(report) {
  const errors = validateReport(report);
  if (errors.length) throw new Error(`invalid ${report.task_id || 'benchmark'} report: ${errors.join('; ')}`);
}
