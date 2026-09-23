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

function recordOutcome(ctx) {
  const decision = ctx.decision;
  const recipients = decision.recipients || [];
  ctx.tally.recipients += recipients.length;
  ctx.tally.fanoutCognitive += recipients.length;
  ctx.tally.transportMessages += decision.action === 'SILENCE' ? 0 : 1;
  const groups = ((decision.meta || {}).groups || []);
  countRefs(ctx, groups, recipients);
  ctx.tally.costUnits += Number((decision.meta || {}).cost || 0);
  if (decision.action === 'SILENCE') {
    ctx.tally.silence += 1;
    if ((decision.meta || {}).stage === 'novelty') ctx.tally.redundantAvoided += 1;
    return;
  }
  scoreRouted(ctx, recipients);
}

function scoreRouted(ctx, recipients) {
  const capable = capableIn({ snap: ctx.snap, candidates: recipients, domain: ctx.intent.domain, senderId: ctx.intent.senderAgentId });
  if (capable.length === 0) return;
  ctx.tally.success += 1;
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
