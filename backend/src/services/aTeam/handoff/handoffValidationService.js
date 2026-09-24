'use strict';

const { validateHandoff } = require('../contracts/handoffContract');

function validateDelivery(handoff) {
  const validation = validateHandoff(handoff);
  if (!validation.valid) return { valid: false, errors: validation.errors };
  if (!handoff.evidenceRefs.length) return { valid: false, errors: ['evidenceRefs must not be empty.'] };
  return { valid: true, errors: [] };
}

module.exports = { validateDelivery };
