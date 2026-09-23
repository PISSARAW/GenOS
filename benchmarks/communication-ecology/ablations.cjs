'use strict';

/**
 * Ablations : contribution de chaque composante, bras D comme référence.
 *
 * Par reconstruction (monde frais) : noCommonGround, noSocialGraph,
 * noTransactiveMemory, noDialects. Par contrefactuel sur les traces D :
 * noStrategicSilence (forcer l'envoi des SILENCE), noSelectiveMulticast
 * (variantes → 1), noEpistemicFirewall (conclusions à tout le corrélé).
 */

const { buildWorld } = require('./world.cjs');
const { snapshotWorld, knownAll, correlatedWith } = require('./snapshot.cjs');
const { runEngine } = require('./engineVariant.cjs');
const { estimateCost } = require('../../backend/src/services/communication/communicationCostService');

const ABLATIONS = [
  { name: 'noCommonGround', setup: (db) => db.exec('DELETE FROM communication_common_ground') },
  { name: 'noSocialGraph', setup: null, blind: true },
  { name: 'noTransactiveMemory', setup: (db) => db.exec('UPDATE agent_expertise SET competence = 0.5, calibration = 0.25, reliability = 0.5') },
  { name: 'noDialects', setup: null },
  { name: 'noStrategicSilence', counterfactual: true },
  { name: 'noSelectiveMulticast', counterfactual: true },
  { name: 'noEpistemicFirewall', counterfactual: true }
];

function ablationOpts(baseOpts, ablation) {
  if (ablation.name === 'noDialects') return Object.assign({}, baseOpts, { dialectAvailable: false });
  if (ablation.blind) return Object.assign({}, baseOpts, { independenceThreshold: 0 });
  return baseOpts;
}

async function runSingleAblation(job, ablation) {
  if (ablation.counterfactual) return counterfactualOf(job, ablation);
  const db = await job.freshDb();
  const world = await buildWorld(db, job.worldConfig);
  if (ablation.setup) await ablation.setup(db);
  const snap = await snapshotWorld(db, world);
  const run = await runEngine({ snap, db, intents: job.intents, opts: ablationOpts(job.baseOpts, ablation) });
  await db.close();
  return { name: ablation.name, tally: run.tally };
}

function silenceCounterfactual(job) {
  const extra = { costUnits: 0, transportMessages: 0, fanoutCognitive: 0, redundantSent: 0, forced: 0 };
  for (const record of job.base.records) {
    if (record.decision.action !== 'SILENCE') continue;
    const domainAgents = (job.base.snap.byDomain.get(record.intent.domain) || [])
      .filter((id) => id !== record.intent.senderAgentId);
    const forced = estimateCost({
      encoding: 'formal-result', recipientCount: domainAgents.length, grounding: 'semantic_ack',
      contaminationRisk: 0.2, disclosureRisk: 0.2
    });
    extra.costUnits += forced.total;
    extra.transportMessages += 1;
    extra.fanoutCognitive += domainAgents.length;
    extra.forced += 1;
    for (const id of domainAgents) {
      if (knownAll({ snap: job.base.snap, agentA: record.intent.senderAgentId, agentB: id, refs: record.intent.semanticRefs })) extra.redundantSent += 1;
    }
  }
  return Object.assign({}, job.base.tally, {
    costUnits: job.base.tally.costUnits + extra.costUnits,
    transportMessages: job.base.tally.transportMessages + extra.transportMessages,
    fanoutCognitive: job.base.tally.fanoutCognitive + extra.fanoutCognitive,
    redundantSent: job.base.tally.redundantSent + extra.redundantSent,
    silence: 0, forcedSends: extra.forced
  });
}

function multicastCounterfactual(job) {
  let collapsed = 0;
  let variantsBefore = 0;
  for (const record of job.base.records) {
    const variants = ((record.decision.meta || {}).groups || []).length;
    if (variants > 1) {
      collapsed += 1;
      variantsBefore += variants;
    }
  }
  return Object.assign({}, job.base.tally, {
    variants: job.base.tally.variants - variantsBefore + collapsed,
    collapsedIntents: collapsed, note: 'single union payload per intent; payload-size effect unmeasured'
  });
}

function firewallCounterfactual(job) {
  let contaminationOff = 0;
  for (const record of job.base.records) {
    const intent = record.intent;
    if (intent.purpose !== 'verify' && intent.purpose !== 'challenge') continue;
    const circle = correlatedWith(job.base.snap, intent.senderAgentId, 0.5);
    const domainAgents = job.base.snap.byDomain.get(intent.domain) || [];
    for (const id of domainAgents) {
      if (id !== intent.senderAgentId && circle.has(id)) contaminationOff += 1;
    }
  }
  return Object.assign({}, job.base.tally, {
    contamination: contaminationOff, firewallPrevented: contaminationOff - job.base.tally.contamination
  });
}

function counterfactualOf(job, ablation) {
  if (ablation.name === 'noStrategicSilence') return { name: ablation.name, tally: silenceCounterfactual(job) };
  if (ablation.name === 'noSelectiveMulticast') return { name: ablation.name, tally: multicastCounterfactual(job) };
  return { name: ablation.name, tally: firewallCounterfactual(job) };
}

async function runAblations(job) {
  const results = [];
  for (const ablation of ABLATIONS) {
    results.push(await runSingleAblation(job, ablation));
  }
  return results;
}

module.exports = { ABLATIONS, runAblations };
