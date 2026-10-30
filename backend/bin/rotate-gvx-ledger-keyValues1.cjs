'use strict';

function rotateValue1(__genosValueScope1) {
  return !__genosValueScope1.updateGuard?.sql || !/BEFORE\s+UPDATE\s+ON\s+gvx_development_events/i.test(__genosValueScope1.updateGuard.sql)
        || !/RAISE\s*\(\s*ABORT\s*,\s*'gvx_event_is_immutable'\s*\)/i.test(__genosValueScope1.updateGuard.sql)
        || !__genosValueScope1.deleteGuard?.sql || !/BEFORE\s+DELETE\s+ON\s+gvx_development_events/i.test(__genosValueScope1.deleteGuard.sql)
        || !/RAISE\s*\(\s*ABORT\s*,\s*'gvx_event_is_immutable'\s*\)/i.test(__genosValueScope1.deleteGuard.sql);
}

module.exports = { rotateValue1 };
