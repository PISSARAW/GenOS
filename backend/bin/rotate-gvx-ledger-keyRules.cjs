'use strict';

function rotate(context) {
  return !context.updateGuard?.sql || !/BEFORE\s+UPDATE\s+ON\s+gvx_development_events/i.test(context.updateGuard.sql)
        || !/RAISE\s*\(\s*ABORT\s*,\s*'gvx_event_is_immutable'\s*\)/i.test(context.updateGuard.sql)
        || !context.deleteGuard?.sql || !/BEFORE\s+DELETE\s+ON\s+gvx_development_events/i.test(context.deleteGuard.sql)
        || !/RAISE\s*\(\s*ABORT\s*,\s*'gvx_event_is_immutable'\s*\)/i.test(context.deleteGuard.sql);
}

module.exports = { rotate };
