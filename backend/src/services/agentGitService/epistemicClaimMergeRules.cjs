'use strict';

function mergeClaimsRule1(context) {
  return context.aChanged && context.bChanged && !context.same(context.a, context.b) ? context.combineEvidence(context.a, context.b) : context.calibrate(context.bChanged ? context.b : context.a);
}

function mergeClaimsRule2(context) {
  return context.aChanged && context.bChanged && !context.same(context.a, context.b) && !context.compatible(context.a, context.b);
}

function replaceClaims(context) {
  return context.req.tenant && (context.row.organization_id && context.row.organization_id !== context.req.tenant.organizationId
        || context.row.project_id && context.row.project_id !== context.req.tenant.projectId);
}

function mergeClaimsRule4(context) {
  return (context.a || context.b) && !context.selected;
}

module.exports = { mergeClaimsRule1, mergeClaimsRule2, replaceClaims, mergeClaimsRule4 };
