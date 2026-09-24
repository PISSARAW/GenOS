'use strict';

function validateOwnership(memberIds, memberId) {
  const valid = typeof memberId === 'string' && memberIds.includes(memberId);
  return valid ? { valid: true } : { valid: false, reason: 'Claim author is not an active community member.' };
}

module.exports = { validateOwnership };
