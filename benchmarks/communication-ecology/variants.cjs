'use strict';

/**
 * Bras A (LLM naïf, diffusion textuelle) et B (zero-text actuel).
 *
 * Modèles exacts en comptes : appels LLM, messages, fanout, wakeups,
 * redondance et contamination sont lus sur l'état monde. Les messages
 * naïfs sont générés (templates) : on mesure leurs BYTES exacts, pas
 * des tokens estimés — aucun `chars / 4` dans ce harness.
 */

const { knownAll, competenceOf, correlatedWith, capableIn } = require('./snapshot.cjs');

function emptyTally() {
  return {
    intents: 0, silence: 0, structured: 0, signal: 0, dialect: 0,
    micro: 0, dialogue: 0, human: 0, stigmergy: 0,
    recipients: 0, variants: 0, llmCalls: 0, wakeups: 0, humans: 0,
    transportMessages: 0, fanoutCognitive: 0,
    redundantSent: 0, redundantAvoided: 0,
    success: 0, verifiedSuccess: 0, contamination: 0, independenceViolations: 0,
    costUnits: 0, bytesOut: 0, wallMs: 0, refsTransmitted: 0, refsNaive: 0
  };
}

function naiveMessageBytes(intent) {
  const text = `Hey team, ${intent.senderAgentId} here about ${intent.domain}: ${intent.purpose} — ${intent.semanticRefs.join(', ')} (urgency ${intent.urgency}). What do you think? Please confirm understanding and proceed.`;
  return Buffer.byteLength(text, 'utf8');
}

function successOf(snap, intent, recipients) {
  const capable = capableIn({ snap, candidates: recipients, domain: intent.domain, senderId: intent.senderAgentId });
  if (capable.length === 0) return { success: false, verified: false };
  if (!intent.independenceRequired) return { success: true, verified: true };
  const circle = correlatedWith(snap, intent.senderAgentId, 0.5);
  const independent = capable.filter((id) => !circle.has(id));
  return { success: true, verified: independent.length > 0 };
}

function contaminationOf(snap, intent, recipients) {
  if (intent.purpose !== 'verify' && intent.purpose !== 'challenge') return 0;
  const circle = correlatedWith(snap, intent.senderAgentId, 0.5);
  let count = 0;
  for (const id of recipients) {
    if (circle.has(id)) count += 1;
  }
  return count;
}

function tallyNaiveIntent(snap, intent, tally) {
  const recipients = (snap.byDomain.get(intent.domain) || []).filter((id) => id !== intent.senderAgentId);
  tally.intents += 1;
  tally.llmCalls += recipients.length;
  tally.wakeups += recipients.length;
  tally.transportMessages += recipients.length;
  tally.fanoutCognitive += recipients.length;
  tally.recipients += recipients.length;
  tally.bytesOut += naiveMessageBytes(intent) * recipients.length;
  tally.costUnits += recipients.length * 0.436;
  tally.refsTransmitted += intent.semanticRefs.length * recipients.length;
  tally.refsNaive += intent.semanticRefs.length * recipients.length;
  for (const id of recipients) {
    if (knownAll({ snap, agentA: intent.senderAgentId, agentB: id, refs: intent.semanticRefs })) tally.redundantSent += 1;
  }
  const outcome = successOf(snap, intent, recipients);
  if (outcome.success) tally.success += 1;
  if (outcome.verified) tally.verifiedSuccess += 1;
  const leaked = contaminationOf(snap, intent, recipients);
  tally.contamination += leaked;
  if (intent.independenceRequired && leaked > 0) tally.independenceViolations += 1;
}

function runNaive(snap, intents) {
  const tally = emptyTally();
  const started = Date.now();
  for (const intent of intents) {
    tallyNaiveIntent(snap, intent, tally);
  }
  tally.wallMs = Date.now() - started;
  return tally;
}

function tallyZeroTextIntent(snap, intent, tally) {
  const subs = (snap.subs.get(`dom.${intent.domain}.alerts`) || []).filter((id) => id !== intent.senderAgentId);
  tally.intents += 1;
  tally.transportMessages += 1;
  tally.fanoutCognitive += subs.length;
  tally.recipients += subs.length;
  tally.variants += 1;
  tally.costUnits += 0.02 * subs.length + 0.01;
  tally.refsTransmitted += intent.semanticRefs.length * subs.length;
  tally.refsNaive += intent.semanticRefs.length * subs.length;
  for (const id of subs) {
    if (knownAll({ snap, agentA: intent.senderAgentId, agentB: id, refs: intent.semanticRefs })) tally.redundantSent += 1;
  }
  const outcome = successOf(snap, intent, subs);
  if (outcome.success) tally.success += 1;
  if (outcome.verified) tally.verifiedSuccess += 1;
  tally.contamination += contaminationOf(snap, intent, subs);
}

function runZeroText(snap, intents) {
  const tally = emptyTally();
  const started = Date.now();
  for (const intent of intents) {
    tallyZeroTextIntent(snap, intent, tally);
  }
  tally.wallMs = Date.now() - started;
  return tally;
}

module.exports = { emptyTally, runNaive, runZeroText, competenceOf };
