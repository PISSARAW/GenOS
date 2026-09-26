'use strict';

const assert = require('node:assert/strict');
const loop = require('../src/services/foragingLoopService');
const foraging = require('../src/services/mcpBioTools/handlers/optimalForaging');

async function verifyDepartureNavigates() {
  const step = await loop.forageStep({
    sessionId: 'test-session',
    patchHistory: [{ infoGain: 0.01 }, { infoGain: 0.01 }],
    elapsedTimeSec: 10,
    iteration: 3,
    nextUrl: 'https://example.com/next',
    htmlContent: '<html><body>next patch</body></html>'
  });
  assert.equal(step.decision, 'PATCH_DEPARTURE');
  assert.equal(step.navigated, true);
  assert.ok(step.navigation, 'departure must carry the navigation receipt');
}

async function verifyExploitObserves() {
  const step = await loop.forageStep({
    sessionId: 'test-session-exploit',
    patchHistory: [{ infoGain: 5 }, { infoGain: 5 }],
    elapsedTimeSec: 2,
    iteration: 1
  });
  assert.equal(step.decision, 'EXPLOIT_PATCH');
  assert.ok(step.suggestedFovea, 'exploitation must suggest a foveal scan');
}

async function verifyDepartureWithoutUrl() {
  const step = await loop.forageStep({
    sessionId: 'test-session-nourl',
    patchHistory: [{ infoGain: 0.01 }],
    elapsedTimeSec: 10,
    iteration: 1
  });
  assert.equal(step.decision, 'PATCH_DEPARTURE');
  assert.equal(step.navigated, false);
}

async function verifyHandlerWiring() {
  const res = await foraging.handleOptimalForaging({
    action: 'forage_step',
    session_id: 'handler-session',
    patch_history: [{ infoGain: 0.01 }],
    elapsed_time_sec: 10,
    next_url: 'https://example.com/handler',
    html_content: '<html><body>handler patch</body></html>'
  });
  assert.equal(res.status, 'completed');
  const step = JSON.parse(res.output);
  assert.equal(step.decision, 'PATCH_DEPARTURE');
  assert.equal(step.navigated, true);
}

(async () => {
  await verifyDepartureNavigates();
  await verifyExploitObserves();
  await verifyDepartureWithoutUrl();
  await verifyHandlerWiring();
  console.log('Foraging closed-loop tests passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
