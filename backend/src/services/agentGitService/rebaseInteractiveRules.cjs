'use strict';

function loadPlanRule1(context) {
  return !context.base || !context.onto || context.ids.includes(context.ontoId);
}

function loadPlanRule2(context) {
  return context.req.body?.refName || context.commits.at(-1).ref_name || 'main';
}

module.exports = { loadPlanRule1, loadPlanRule2 };
