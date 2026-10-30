'use strict';

function mergeClaimsValue1(__genosValueScope1) {
  return __genosValueScope1.aChanged && __genosValueScope1.bChanged && !(0, __genosValueScope1.same)(__genosValueScope1.a, __genosValueScope1.b) ? (0, __genosValueScope1.combineEvidence)(__genosValueScope1.a, __genosValueScope1.b) : (0, __genosValueScope1.calibrate)(__genosValueScope1.bChanged ? __genosValueScope1.b : __genosValueScope1.a);
}

function mergeClaimsValue2(__genosValueScope2) {
  return __genosValueScope2.aChanged && __genosValueScope2.bChanged && !(0, __genosValueScope2.same)(__genosValueScope2.a, __genosValueScope2.b) && !(0, __genosValueScope2.compatible)(__genosValueScope2.a, __genosValueScope2.b);
}

function replaceClaimsValue3(__genosValueScope3) {
  return __genosValueScope3.req.tenant && (__genosValueScope3.row.organization_id && __genosValueScope3.row.organization_id !== __genosValueScope3.req.tenant.organizationId
        || __genosValueScope3.row.project_id && __genosValueScope3.row.project_id !== __genosValueScope3.req.tenant.projectId);
}

function mergeClaimsValue4(__genosValueScope4) {
  return (__genosValueScope4.a || __genosValueScope4.b) && !__genosValueScope4.selected;
}

module.exports = { mergeClaimsValue1, mergeClaimsValue2, replaceClaimsValue3, mergeClaimsValue4 };
