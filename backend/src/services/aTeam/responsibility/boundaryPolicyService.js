'use strict';

const authorityMatrix = require('./authorityMatrixService');
const { contractForMember } = require('./responsibilityService');

function consultationRecorded(mutation) {
  return mutation.consulted === true || (Array.isArray(mutation.consultationRefs) && mutation.consultationRefs.length > 0);
}

function denied(code, scope, owner) {
  return { allowed: false, code, scope, ownerId: owner?.agentId || null };
}

function assessAuthority({ mutation, member, scope, owner }) {
  const mayModify = authorityMatrix.canModify(member, scope);
  const consultationRequired = authorityMatrix.requiresConsultation(member, scope) || Boolean(owner && owner.agentId !== member.agentId);
  const canPropose = contractForMember(member).mayPropose.includes(scope);
  if (!mayModify && !canPropose) return denied('AUTHORITY_VIOLATION', scope, owner);
  if ((consultationRequired || !mayModify) && !consultationRecorded(mutation)) {
    const code = consultationRequired ? 'MISSING_CONSULTATION' : 'UNAPPROVED_CROSS_DOMAIN_MUTATION';
    return denied(code, scope, owner);
  }
  return { allowed: true, scope, ownerId: owner?.agentId || null };
}

function assessMutation(mutation, member, members) {
  const scope = String(mutation.scope || mutation.artifact || '').trim();
  if (!scope) return denied('MUTATION_SCOPE_MISSING', null, null);
  const owner = authorityMatrix.ownerFor(scope, members);
  return assessAuthority({ mutation, member, scope, owner });
}

module.exports = { assessMutation };
