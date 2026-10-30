'use strict';

function buildWorkspaceContextValue1(__genosValueScope1) {
  return __genosValueScope1.candidates.some(name => /\.(?:html?|css|[cm]?js|jsx?|tsx?|py|rs|go|java|cs|rb|php)$/i.test(name)) ? ''
    : '\n[WORKSPACE INITIALIZATION] No implementation source files were found. For a create/build task, scaffold from scratch using the mission requirements; an empty starter workspace is not a blocker. For modification or review tasks, report the specific missing source instead of inventing it.';
}

module.exports = { buildWorkspaceContextValue1 };
