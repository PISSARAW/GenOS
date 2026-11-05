'use strict';

function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:/-]{1,128}$/.test(value) ? value : null;
}

function completionSummary(source = {}) {
  const reasons = Array.isArray(source.reasons) ? source.reasons : [];
  const checks = source.closureChecks || {};
  return { verdict: ['failed', 'partial', 'interrupted'].includes(source.verdict) ? source.verdict : null,
    reasons: reasons.map(identifier).filter(Boolean).slice(0, 50), reasonCount: reasons.length,
    closureChecks: Object.fromEntries(['requiredWorkers', 'invariants', 'independentOracle', 'evidence']
      .map(key => [key, typeof checks[key] === 'boolean' ? checks[key] : null])) };
}

function build(terminal) {
  const teamRunId = identifier(terminal.teamRunId);
  return { schema: 'genos.a-team-dispatch-result/v1', success: false,
    error: { code: 'A_TEAM_TERMINAL_FAILURE', message: `A-Team terminal failure: ${terminal.status}.` },
    aTeam: { status: String(terminal.status).toLowerCase(), terminal: true, accepted: false,
      teamRunId, result: { teamRunId, accepted: false,
        completion: completionSummary(terminal.completion || {}) } } };
}

module.exports = { build };
