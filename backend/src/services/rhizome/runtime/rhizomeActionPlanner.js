'use strict';

function plan(route, need) {
  if (route.selected) return { type: 'EXECUTE_ROUTE', routeId: route.route.routeId, needId: need.needId };
  return { type: 'DETECT_GAP', needId: need.needId };
}

module.exports = { plan };
