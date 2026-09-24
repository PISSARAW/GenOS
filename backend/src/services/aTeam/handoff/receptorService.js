'use strict';

const RESPONSES = ['ACCEPT', 'PARTIAL_ACCEPT', 'REJECT', 'REQUEST_REPAIR', 'REQUEST_CLARIFICATION'];

function requiresReason(status) {
  return ['REJECT', 'REQUEST_REPAIR', 'REQUEST_CLARIFICATION'].includes(status);
}

function reasonError(response) {
  if (!requiresReason(response?.status) || String(response.reason || '').trim()) return null;
  return `${response.status.toLowerCase()} reason is required.`;
}

function invalidCriteria(value) {
  return value !== undefined && (!Array.isArray(value)
    || value.some((item) => typeof item !== 'string' || !item.trim()));
}

function validateResponse(response) {
  const errors = [];
  if (!RESPONSES.includes(response?.status)) errors.push('response status is invalid.');
  const missingReason = reasonError(response);
  if (missingReason) errors.push(missingReason);
  if (invalidCriteria(response?.missingCriteria)) errors.push('missingCriteria must be an array of non-empty strings.');
  if (response?.status === 'ACCEPT' && response.missingCriteria?.length) errors.push('ACCEPT cannot include missing criteria.');
  if (response?.status === 'ACCEPT' && !response.evidenceRefs?.length) errors.push('ACCEPT requires evidence references.');
  return { valid: errors.length === 0, errors };
}

function responseTransition(handoff, response) {
  const validation = validateResponse(response);
  if (!validation.valid) return { valid: false, errors: validation.errors, handoff };
  const accepted = response.status === 'ACCEPT';
  return {
    valid: true,
    accepted,
    handoff: {
      ...handoff,
      status: response.status,
      accepted,
      response: {
        status: response.status,
        reason: response.reason || null,
        missingCriteria: response.missingCriteria || [],
        evidenceRefs: response.evidenceRefs || []
      }
    }
  };
}

module.exports = { RESPONSES, validateResponse, responseTransition };
