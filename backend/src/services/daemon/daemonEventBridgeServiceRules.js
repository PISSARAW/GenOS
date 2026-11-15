'use strict';

function applyCheapUpdate(context) {
  return context.event.payload?.files || (context.event.payload?.file ? [context.event.payload.file] : []);
}

module.exports = { applyCheapUpdate };
