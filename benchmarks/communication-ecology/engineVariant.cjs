'use strict';

/**
 * Bras C (GenOS + politique/common-ground) et D (complet + dialectes +
 * verbal borné) : exécutent le VRAI CommunicationPolicyEngine par intent.
 *
 * C : pas de dialecte, pas de trigger verbal. D : dialectes + triggers
 * (clarify → AMBIGUOUS_INTENT, negotiate → COMMITMENT_NEGOTIATION) et
 * comptage des wakeups verbaux via meta.escalation.
 */

const engine = require('../../backend/src/services/communication/communicationPolicyEngine');
const metrics = require('../../backend/src/services/communication/communicationMetricsService');
const { emptyTally } = require('./variants.cjs');
const { knownAll, capableIn, correlatedWith } = require('./snapshot.cjs');

function triggerFor(intent, full) {
  if (!full) return undefined;
  if (intent.purpose === 'clarify') return 'AMBIGUOUS_INTENT';
  if (intent.purpose === 'negotiate') return 'COMMITMENT_NEGOTIATION';
  return undefined;
}

function engineInput(db, intent, opts) {
  return {
    db,
    intent,
    dialectAvailable: opts.dialectAvailable,
    stigmergyAvailable: true,
    trigger: triggerFor(intent, opts.full),
    negotiation: intent.purpose === 'negotiate'
  };
}

function recordVerbal(tally, decision) {
  if (decision.action === 'MICRO_UTTERANCE') tally.wakeups += 1;
  if (decision.action === 'DIALOGUE') {
    const meta = decision.meta || {};
    const esc = meta.escalation || {};
    tally.wakeups += Number(esc.maxTurns || 1);
  }
  if (decision.action === 'HUMAN') tally.humans += 1;
}

function ensureDomain(tally, domain) {
  if (!tally.byDomain[domain]) tally.byDomain[domain] = { intents: 0, cost: 0, success: 0, recipients: 0 };
  return tally.byDomain[domain];
}

function recordSilence(ctx) {
  ctx.tally.silence += 1;
  const meta = ctx.decision.meta || {};
  if (meta.stage === 'novelty') ctx.tally.redundantAvoided += 1;
}

function recordOutcome(ctx) {
  const decision = ctx.decision;
  const meta = decision.meta || {};
  const recipients = decision.recipients || [];
  const domain = ctx.intent.domain || 'undefined';
  const d = ensureDomain(ctx.tally, domain);
  const cost = Number(meta.cost || 0);

  ctx.tally.recipients += recipients.length;
  ctx.tally.fanoutCognitive += recipients.length;
  ctx.tally.transportMessages += decision.action === 'SILENCE' ? 0 : 1;
  countRefs(ctx, meta.groups || [], recipients);
  ctx.tally.costUnits += cost;

  if (decision.action === 'SILENCE') return recordSilence(ctx);

  d.intents += 1;
  d.cost += cost;
  d.recipients += recipients.length;
  scoreRouted(ctx, recipients, d);
}

function scoreRouted(ctx, recipients, d) {
  const capable = capableIn({ snap: ctx.snap, candidates: recipients, domain: ctx.intent.domain, senderId: ctx.intent.senderAgentId });
  if (capable.length === 0) return;
  ctx.tally.success += 1;
  d.success += 1;
  if (!ctx.intent.independenceRequired) {
    ctx.tally.verifiedSuccess += 1;
    return;
  }
  const circle = correlatedWith(ctx.snap, ctx.intent.senderAgentId, 0.5);
  const independent = capable.filter((id) => !circle.has(id));
  if (independent.length > 0) ctx.tally.verifiedSuccess += 1;
  else ctx.tally.independenceViolations += 1;
  ctx.tally.contamination += countLeaked(ctx.intent, recipients, circle);
}

function countRefs(ctx, groups, recipients) {
  ctx.tally.variants += groups.length;
  ctx.tally.refsNaive += ctx.intent.semanticRefs.length * recipients.length;
  for (const group of groups) {
    ctx.tally.refsTransmitted += (group.unknownRefs || []).length;
  }
}

function countLeaked(intent, recipients, circle) {
  let leaked = 0;
  for (const id of recipients) {
    if (circle.has(id) && (intent.purpose === 'verify' || intent.purpose === 'challenge')) leaked += 1;
  }
  return leaked;
}

async function runEngine(job) {
  const tally = emptyTally();
  const records = job.opts.collect || null;
  const started = Date.now();
  for (const intent of job.intents) {
    const decision = await engine.decideCommunication(engineInput(job.db, intent, job.opts));
    metrics.recordDecision(decision);
    recordVerbal(tally, decision);
    recordOutcome({ snap: job.snap, intent, decision, tally });
    tally.intents += 1;
    if (records) records.push({ intent, decision });
  }
  tally.wallMs = Date.now() - started;
  return { tally, records: records || [] };
}

module.exports = { runEngine };
