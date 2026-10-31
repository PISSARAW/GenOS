'use strict';

function loadPlanValue1(__genosValueScope1) {
  return !__genosValueScope1.base || !__genosValueScope1.onto || __genosValueScope1.ids.includes(__genosValueScope1.ontoId);
}

function loadPlanValue2(__genosValueScope2) {
  return __genosValueScope2.req.body?.refName || __genosValueScope2.commits.at(-1).ref_name || 'main';
}

module.exports = { loadPlanValue1, loadPlanValue2 };
