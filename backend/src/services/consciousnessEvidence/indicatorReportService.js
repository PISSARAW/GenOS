'use strict';

const collector = require('./indicatorEvidenceCollector');
const gate = require('./indicatorPromotionGate');

async function report(options) {
  if (!Array.isArray(options.indicators) || !options.indicators.length) throw new TypeError('Indicators required.');
  const reports = [];
  for (const indicatorId of options.indicators) {
    const evidence = await collector.collect({ db: options.db, scope: options.scope, indicatorId });
    reports.push({ ...evidence, nextStage: nextStage(evidence.highestStage),
      operationalGate: gate.evaluate({ indicatorId, receipts: evidence.receipts }) });
  }
  return { generatedAt: new Date().toISOString(), reports,
    claimsPromoted: reports.filter((item) => item.operationalGate.promotionAllowed).map((item) => item.indicatorId) };
}

function nextStage(stage) {
  const index = gate.STAGES.indexOf(stage);
  return gate.STAGES[Math.min(index + 1, gate.STAGES.length - 1)];
}

module.exports = { report, nextStage };
