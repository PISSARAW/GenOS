'use strict';

function verifyLink(context) {
  return !context.integrity.valid || context.integrity.legacy || context.integrity.hash !== context.checkpoint.organismHash ||
      context.workspaceHash !== context.checkpoint.workspaceHash;
}

module.exports = { verifyLink };
