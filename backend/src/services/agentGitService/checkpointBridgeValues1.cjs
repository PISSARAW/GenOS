'use strict';

function verifyLinkValue1(__genosValueScope1) {
  return !__genosValueScope1.integrity.valid || __genosValueScope1.integrity.legacy || __genosValueScope1.integrity.hash !== __genosValueScope1.checkpoint.organismHash ||
      __genosValueScope1.workspaceHash !== __genosValueScope1.checkpoint.workspaceHash;
}

module.exports = { verifyLinkValue1 };
