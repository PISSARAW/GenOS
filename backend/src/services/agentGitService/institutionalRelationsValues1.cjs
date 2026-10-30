'use strict';

function assertRelationValue1(__genosValueScope1) {
  return __genosValueScope1.req.tenant && (__genosValueScope1.relation.organization_id && __genosValueScope1.relation.organization_id !== __genosValueScope1.req.tenant.organizationId
      || __genosValueScope1.relation.project_id && __genosValueScope1.relation.project_id !== __genosValueScope1.req.tenant.projectId);
}

function mergeRelationsValue2(__genosValueScope2) {
  return (0, __genosValueScope2.Number)(__genosValueScope2.selected.authority || 0) > (0, __genosValueScope2.Number)(__genosValueScope2.original?.authority || 0)
        || __genosValueScope2.original && __genosValueScope2.selected.relation_type !== __genosValueScope2.original.relation_type;
}

function replaceRelationsValue3(__genosValueScope3) {
  return (0, __genosValueScope3.Number)(__genosValueScope3.relation.authority || 0) > (0, __genosValueScope3.Number)(__genosValueScope3.old?.authority || 0)
        || __genosValueScope3.old && __genosValueScope3.relation.relation_type !== __genosValueScope3.old.relation_type;
}

function assertRelationValue4(__genosValueScope4) {
  return !__genosValueScope4.Number.isFinite((0, __genosValueScope4.Number)(__genosValueScope4.relation.authority)) || (0, __genosValueScope4.Number)(__genosValueScope4.relation.authority) < 0
      || (0, __genosValueScope4.Number)(__genosValueScope4.relation.authority) > 1;
}

function mergeRelationsValue5(__genosValueScope5) {
  return __genosValueScope5.aChanged && __genosValueScope5.bChanged && !(0, __genosValueScope5.same)(__genosValueScope5.a, __genosValueScope5.b);
}

module.exports = { assertRelationValue1, mergeRelationsValue2, replaceRelationsValue3, assertRelationValue4, mergeRelationsValue5 };
