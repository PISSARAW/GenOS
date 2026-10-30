'use strict';

function applyCheapUpdateValue1(__genosValueScope1) {
  return __genosValueScope1.event.payload?.files || (__genosValueScope1.event.payload?.file ? [__genosValueScope1.event.payload.file] : []);
}

module.exports = { applyCheapUpdateValue1 };
