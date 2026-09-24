'use strict';

const FIELDS = ['owns', 'mayModify', 'mayPropose', 'mustConsult', 'mayRead', 'cannotOverride'];

function cleanList(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function contractForMember(member = {}) {
  const authority = member.authority || member.responsibility || {};
  const owns = cleanList(authority.owns || member.ownedResponsibilities);
  return Object.fromEntries(FIELDS.map((field) => [field, cleanList(field === 'mayModify' && !authority.mayModify ? owns : authority[field])]));
}

function validateContract(contract) {
  const errors = FIELDS.filter((field) => !Array.isArray(contract?.[field])
    || contract[field].some((item) => typeof item !== 'string' || !item.trim()))
    .map((field) => `${field} must be an array of non-empty strings.`);
  return { valid: errors.length === 0, errors };
}

module.exports = { contractForMember, validateContract };
