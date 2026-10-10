'use strict';

function isVerdictTool(toolName) {
  const tokens = String(toolName || '').toLowerCase().split('_');
  return tokens.includes('test') || tokens.includes('verify') || tokens.includes('lint') || tokens.includes('check');
}

function classifyDomainVerdict(text) {
  const normalized = String(text || '').toLowerCase();
  if (/\b(failed|failing|failure|error)\b/.test(normalized)) return 'failure';
  if (/\b(pass|passed|success|ok)\b/.test(normalized)) return 'success';
  return 'unverified';
}

function applyDomainVerdict(toolName, result) {
  if (!result.success) return;
  if (!isVerdictTool(toolName)) return;
  result.domainVerdict = classifyDomainVerdict(String(result.output || '').toLowerCase());
}

module.exports = { applyDomainVerdict };
