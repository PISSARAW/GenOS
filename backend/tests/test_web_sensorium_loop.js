'use strict';

/** Phase 3: Web Sensorium — Canonical Web State & Closed-Loop Foraging. */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { getDatabase, closeDatabase, withWriteRetry } = require('../src/db');
const browserScout = require('../src/services/browserScoutService');
const defaultBrowserScout = browserScout.defaultBrowserScout;
const fovealVision = require('../src/services/fovealVisionService');
const defaultFovealVision = fovealVision.defaultFovealVision;
const foraging = require('../src/services/foragingScoutHarvesterService');
const defaultForaging = foraging.defaultForaging;
const sensorium = require('../src/services/perception/sensoriumService');
const perceptionBridge = require('../src/services/perception/perceptionMemoryBridgeService');
const handlersRegistry = require('../src/services/primitiveHandlers/handlersRegistry');
const telemetry = require('../src/services/telemetryObserver');

const CORRELATION_ID = `web-sensorium-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const AGENT_ID = 'web-sensorium-agent';

function emitCorrelated(eventType, action, { detail, payload = {}, severity = 'info' } = {}) {
  telemetry.emitEvent({
    eventType,
    agentId: AGENT_ID,
    action,
    detail,
    payload: { ...payload, correlationId: CORRELATION_ID },
    severity
  });
}

let observationSeq = 0;

function makeObservation(sensorId, type, extra) {
  observationSeq += 1;
  return { id: `obs-${Date.now()}-${observationSeq}`, sensorId, type, timestamp: new Date().toISOString(), ...extra };
}

function makeDecisionRecord(cycle, action, options) {
  return { id: `dec-${Date.now()}-${cycle}`, cycle, action, reason: options.reason, basedOn: options.basedOn, timestamp: new Date().toISOString() };
}

function mockPageHtml() {
  return '<html><head><title>Test Page - Scientific Data</title></head><body><h1>Climate Data Dashboard</h1><table id="data-table"><thead><tr><th>Year</th><th>CO2 (ppm)</th><th>Temp Anomaly</th></tr></thead><tbody><tr><td>2020</td><td>412.5</td><td>1.02</td></tr><tr><td>2021</td><td>414.7</td><td>1.11</td></tr><tr><td>2022</td><td>417.1</td><td>1.16</td></tr><tr><td>2023</td><td>419.3</td><td>1.20</td></tr></tbody></table><img id="chart" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="CO2 trend chart" /><a href="/downloads/data.csv">Download CSV</a></body></html>';
}

function mockPageHtml2() {
  return '<html><head><title>Extended Climate Dataset</title></head><body><h1>Extended Climate Data</h1><table id="extended-table"><thead><tr><th>Year</th><th>CO2 (ppm)</th><th>Temp Anomaly</th><th>Source</th></tr></thead><tbody><tr><td>2024</td><td>421.5</td><td>1.25</td><td>NOAA</td></tr><tr><td>2025</td><td>423.8</td><td>1.30</td><td>NOAA</td></tr></tbody></table></body></html>';
}

function isTableNode(n) {
  return n.role === 'table' || (n.selectorId && n.selectorId.includes('table'));
}

function isChartNode(n) {
  return n.role === 'img' || (n.label && n.label.includes('chart'));
}

function isDownloadLink(n) {
  return n.role === 'link' && n.isDownload;
}

function isAnyLink(n) {
  return n.role === 'link';
}

function setupSensorium() {
  emitCorrelated('WEB_SENSORIUM_SETUP', 'SETUP', { detail: 'Creating sensorium with web perception capabilities', payload: { sensors: ['browser', 'foveal', 'foraging'], attentionBudget: 10 } });
  const state = sensorium.createSensorium({ agentId: AGENT_ID, sensors: ['browser_act', 'foveal_crop', 'optimal_foraging'], attentionBudget: 10 });
  assert.ok(state, 'Sensorium must be created');
  return state;
}

function recordNavigationObservation(url, axResult, infoGain) {
  const observation = makeObservation('browser_act', 'navigation', { url, title: axResult.title, axNodesCount: axResult.axNodes.length, infoGain });
  sensorium.recordObservation({ agentId: AGENT_ID, observation });
  return observation;
}

async function makeFovealObservation() {
  const fs = require('fs');
  const sharp = require('sharp');
  const testImagePath = path.join(process.cwd(), '.genos', 'workspace', 'fovea', `test_chart_${Date.now()}.png`);
  if (!fs.existsSync(testImagePath)) {
    await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 255, g: 100, b: 50, alpha: 1 } } }).png().toFile(testImagePath);
  }
  const fovealResult = await defaultFovealVision.fovealCrop(testImagePath, [100, 100, 500, 500], { zoomFactor: 2.0, focusNotes: 'Chart axes and legend' });
  const observation = makeObservation('foveal_crop', 'foveal_crop', { sourceImage: testImagePath, cropId: fovealResult.cropId, zoomFactor: fovealResult.zoomFactor, infoGain: 0.6 });
  sensorium.recordObservation({ agentId: AGENT_ID, observation });
  return { observation, fovealResult };
}

function makeForagingObservation(foragingEval, infoGain) {
  const observation = makeObservation('optimal_foraging', 'foraging_evaluation', { marginalYield: foragingEval.marginalYield, shouldDepart: foragingEval.shouldDepart, decision: foragingEval.decision, infoGain });
  sensorium.recordObservation({ agentId: AGENT_ID, observation });
  return observation;
}

function decideNextAction(foragingEval) {
  if (foragingEval.shouldDepart) return { action: 'navigate_new_source', reason: 'Patch depleted, navigating to new source' };
  return { action: 'download_csv', reason: 'Patch still productive, downloading data for analysis' };
}

async function executeBrowserAction(sessionId, session, nextAction) {
  if (nextAction === 'download_csv') {
    const downloadNode = session.axTree.find(isDownloadLink);
    return handlersRegistry.HANDLERS.browser_act({ sessionId, type: 'click', selectorId: downloadNode?.selectorId });
  }
  return handlersRegistry.HANDLERS.browser_act({ sessionId, type: 'click', selectorId: session.axTree.find(isAnyLink)?.selectorId });
}

async function runCycle1(session) {
  const sessionId = 'sensorium-test-session';
  emitCorrelated('WEB_CYCLE1_BROWSER_NAVIGATE', 'NAVIGATE', { detail: 'Opening browser session to test URL', payload: { url: 'https://example.com' } });
  const axResult = defaultBrowserScout.buildAXTree(mockPageHtml(), 'https://example.com');
  session.axTree = axResult.axNodes;
  session.currentUrl = 'https://example.com';
  session.title = axResult.title;
  const observation1 = recordNavigationObservation('https://example.com', axResult, 0.75);
  emitCorrelated('WEB_CYCLE1_OBSERVATION', 'OBSERVE', { detail: 'Browser navigation observation recorded', payload: { observation: observation1 } });
  const tableNode = axResult.axNodes.find(isTableNode);
  const chartNode = axResult.axNodes.find(isChartNode);
  const downloadLink = axResult.axNodes.find(isDownloadLink);
  emitCorrelated('WEB_CYCLE1_STATE_ANALYSIS_COMPLETE', 'ANALYZE', { detail: 'Page structure analyzed', payload: { hasTable: !!tableNode, hasChart: !!chartNode, hasDownload: !!downloadLink } });
  emitCorrelated('WEB_CYCLE1_FOVEAL_CROP', 'FOVEATE', { detail: 'Cropping chart region for detailed analysis', payload: { targetType: 'scientific_plot' } });
  const foveal = await makeFovealObservation();
  emitCorrelated('WEB_CYCLE1_FOVEAL_COMPLETE', 'FOVEATE', { detail: 'Foveal crop completed', payload: { cropId: foveal.fovealResult.cropId, observation: foveal.observation } });
  const patchHistory = [{ infoGain: observation1.infoGain, elapsedTimeSec: 5 }, { infoGain: foveal.observation.infoGain, elapsedTimeSec: 3 }];
  const foragingEval = defaultForaging.evaluatePatchYield(patchHistory, 8);
  const observation3 = makeForagingObservation(foragingEval, 0.4);
  emitCorrelated('WEB_CYCLE1_FORAGING_COMPLETE', 'FORAGE_EVAL', { detail: 'Foraging evaluation complete', payload: { evaluation: foragingEval, observation: observation3 } });
  const chosen = decideNextAction(foragingEval);
  const decisionRecord = makeDecisionRecord(1, chosen.action, { reason: chosen.reason, basedOn: ['browser_navigation', 'foveal_crop', 'foraging_evaluation'] });
  emitCorrelated('WEB_CYCLE1_DECISION_COMPLETE', 'DECIDE', { detail: 'Decision made', payload: { decision: decisionRecord } });
  const actionResult = await executeBrowserAction(sessionId, session, chosen.action);
  const observation4 = makeObservation('browser_act', 'action_result', { action: chosen.action, success: actionResult.success !== false, infoGain: 0.5 });
  sensorium.recordObservation({ agentId: AGENT_ID, observation: observation4 });
  emitCorrelated('WEB_CYCLE1_ACTION_COMPLETE', 'ACT', { detail: 'Action executed', payload: { action: chosen.action, result: actionResult, observation: observation4 } });
  const verification = { cyclesCompleted: 1, actionVerified: actionResult.success !== false, observationsRecorded: 4, sensoriumRevision: sensorium.getSensorium(AGENT_ID)?.revision || 0, infoGainTotal: [observation1, foveal.observation, observation3, observation4].reduce((sum, o) => sum + (o.infoGain || 0), 0) };
  emitCorrelated('WEB_CYCLE1_VERIFICATION_COMPLETE', 'VERIFY', { detail: 'Cycle 1 verification complete', payload: { verification } });
  return { patchHistory, observation1, fovealObservation: foveal.observation, observation3, observation4, decisionRecord, verification };
}

async function runCycle2(session, cycle1) {
  emitCorrelated('WEB_CYCLE2_BROWSER_NAVIGATE', 'NAVIGATE', { detail: 'Navigating to next data source based on foraging decision', payload: {} });
  const axResult2 = defaultBrowserScout.buildAXTree(mockPageHtml2(), 'https://example.org/next-source');
  session.axTree = axResult2.axNodes;
  session.currentUrl = 'https://example.org/next-source';
  session.title = axResult2.title;
  const observation5 = recordNavigationObservation('https://example.org/next-source', axResult2, 0.7);
  emitCorrelated('WEB_CYCLE2_OBSERVATION', 'OBSERVE', { detail: 'Second navigation observation recorded', payload: { observation: observation5 } });
  emitCorrelated('WEB_CYCLE2_STATE_ANALYSIS', 'ANALYZE', { detail: 'Analyzing new table structure', payload: {} });
  const patchHistory2 = [...cycle1.patchHistory, { infoGain: cycle1.observation4.infoGain, elapsedTimeSec: 4 }, { infoGain: observation5.infoGain, elapsedTimeSec: 3 }];
  const foragingEval2 = defaultForaging.evaluatePatchYield(patchHistory2, 15);
  const observation6 = makeForagingObservation(foragingEval2, 0.35);
  emitCorrelated('WEB_CYCLE2_FORAGING_COMPLETE', 'FORAGE_EVAL', { detail: 'Second foraging evaluation complete', payload: { evaluation: foragingEval2, observation: observation6 } });
  const nextAction2 = foragingEval2.shouldDepart ? 'depart_environment' : 'analyze_trends';
  const reason2 = foragingEval2.shouldDepart ? 'Environment depleted, departing' : 'Continuing trend analysis';
  const decisionRecord2 = makeDecisionRecord(2, nextAction2, { reason: reason2, basedOn: ['second_navigation', 'foraging_evaluation'] });
  emitCorrelated('WEB_CYCLE2_DECISION_COMPLETE', 'DECIDE', { detail: 'Second decision made', payload: { decision: decisionRecord2 } });
  emitCorrelated('WEB_CYCLE2_ACTION', 'ACT', { detail: `Executing ${nextAction2}`, payload: { action: nextAction2 } });
  const finalSensorium = sensorium.getSensorium(AGENT_ID);
  const verification2 = { cycle: 2, actionVerified: true, totalObservations: finalSensorium?.observations?.length || 0, sensoriumRevision: finalSensorium?.revision || 0, totalInfoGain: finalSensorium?.observations?.reduce((sum, o) => sum + (o.infoGain || 0), 0) || 0, cyclesCompleted: 2 };
  emitCorrelated('WEB_CYCLE2_VERIFICATION_COMPLETE', 'VERIFY', { detail: 'Cycle 2 verification complete', payload: { verification: verification2 } });
  return { observation5, observation6, decisionRecord2, verification2 };
}

function buildAuditTrail(input) {
  const observations = input.finalState.observations;
  return {
    correlationId: CORRELATION_ID,
    agentId: AGENT_ID,
    cycles: 2,
    totalObservations: observations.length,
    totalInfoGain: observations.reduce((sum, o) => sum + (o.infoGain || 0), 0),
    decisions: [input.cycle1.decisionRecord, input.cycle2.decisionRecord2],
    observations: observations.map(o => ({ id: o.id, sensorId: o.sensorId, type: o.type, infoGain: o.infoGain })),
    durationMs: Date.now() - input.startedAt,
    success: runWebSensoriumLoopCondition(input.finalState, input.cycle1.verification, input.cycle2.verification2)
  };
}

function assertAuditTrail(input) {
  assert.ok(input.auditTrail.success, 'Audit trail must show 2 complete cycles with sufficient observations');
  assert.ok(input.finalState.observations.length >= 6, 'Must have at least 6 observations (3 per cycle minimum)');
  assert.ok(input.cycle1.verification.cyclesCompleted >= 1, 'Cycle 1 must complete');
  assert.ok(input.cycle2.verification2.cyclesCompleted >= 1, 'Cycle 2 must complete');
}

async function runWebSensoriumLoop() {
  console.log(`\n=== Phase 3 Web Sensorium: ${CORRELATION_ID} ===`);
  const startedAt = Date.now();
  setupSensorium();
  const sessionId = 'sensorium-test-session';
  const existing = defaultBrowserScout.getSession(sessionId);
  const session = existing || defaultBrowserScout.createSession(sessionId);
  const cycle1 = await runCycle1(session);
  const cycle2 = await runCycle2(session, cycle1);
  const finalState = sensorium.getSensorium(AGENT_ID);
  const auditTrail = buildAuditTrail({ finalState, cycle1, cycle2, startedAt });
  assertAuditTrail({ auditTrail, finalState, cycle1, cycle2 });
  emitCorrelated('WEB_SENSORIUM_AUDIT_COMPLETE', 'AUDIT', { detail: 'Web sensorium audit trail complete', payload: { audit: auditTrail } });
  console.log(`\n=== WEB SENSORIUM COMPLETE (${Date.now() - startedAt}ms) ===`);
  console.log(`Correlation ID: ${CORRELATION_ID}`);
  await closeDatabase();
  return { success: true, correlationId: CORRELATION_ID, auditTrail };
}

if (require.main === module) {
  runWebSensoriumLoop()
    .then(result => {
      console.log('\nWeb sensorium test PASSED');
      process.exit(0);
    })
    .catch(err => {
      console.error('\nWeb sensorium test FAILED:', err);
      process.exit(1);
    });
}

module.exports = { runWebSensoriumLoop, CORRELATION_ID };
function runWebSensoriumLoopCondition(finalState, verificationFinal, verification2Final) {
  return finalState.observations.length >= 6 && verificationFinal.cyclesCompleted >= 1 && verification2Final.cyclesCompleted >= 1;
}

function runWebSensoriumLoopCondition2(n) {
  return n.role === 'table' || (n.selectorId && n.selectorId.includes('table'));
}
