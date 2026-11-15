'use strict';

function assertRelationRule1(context) {
  return context.req.tenant && (context.relation.organization_id && context.relation.organization_id !== context.req.tenant.organizationId
      || context.relation.project_id && context.relation.project_id !== context.req.tenant.projectId);
}

function mergeRelationsRule2(context) {
  return context.Number(context.selected.authority || 0) > context.Number(context.original?.authority || 0)
        || context.original && context.selected.relation_type !== context.original.relation_type;
}

function replaceRelations(context) {
  return context.Number(context.relation.authority || 0) > context.Number(context.old?.authority || 0)
        || context.old && context.relation.relation_type !== context.old.relation_type;
}

function assertRelationRule4(context) {
  return !context.Number.isFinite(context.Number(context.relation.authority)) || context.Number(context.relation.authority) < 0
      || context.Number(context.relation.authority) > 1;
}

function mergeRelationsRule5(context) {
  return context.aChanged && context.bChanged && !context.same(context.a, context.b);
}

module.exports = { assertRelationRule1, mergeRelationsRule2, replaceRelations, assertRelationRule4, mergeRelationsRule5 };
