'use strict';

const { contractForMember } = require('./responsibilityService');

function ownerFor(scope, members) {
  return members.find((member) => contractForMember(member).owns.includes(scope)) || null;
}

function canModify(member, scope) {
  const contract = contractForMember(member);
  return contract.mayModify.includes(scope) || contract.owns.includes(scope);
}

function requiresConsultation(member, scope) {
  return contractForMember(member).mustConsult.includes(scope);
}

module.exports = { ownerFor, canModify, requiresConsultation };
