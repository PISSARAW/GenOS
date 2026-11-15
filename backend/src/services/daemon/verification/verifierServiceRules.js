'use strict';

function verifyFinding(context) {
  return !context.db || !context.args || !context.args.findingId;
}

module.exports = { verifyFinding };
