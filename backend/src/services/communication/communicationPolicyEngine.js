'use strict';

/**
 * CommunicationPolicyEngine — SHADOW MODE.
 *
 * decideCommunication(intent) ne modifie RIEN : il produit une
 * CommunicationDecision + utilité expliquée. logShadowDecision consigne
 * la décision face au comportement courant pour calibration hors-ligne.
 * Activation progressive : SILENCE / audience / multicast d'abord
 * (voir ordre d'implémentation de l'ADR 003x).
 */

const { getDatabase } = require('../../db');
const { getSignalPlaneMetrics } = require('../signalMetricsService');
const { selectAudience } = require('./audienceSelectorService');
const { selectEncoding } = require('./selectiveEncodingService');
const { estimateCost, estimateNaiveBroadcast } = require('./communicationCostService');

const INTENT_PURPOSES = new Set([
  'inform', 'request', 'delegate', 'clarify', 'challenge', 'verify', 'warn',
  'negotiate', 'commit', 'recruit', 'coordinate', 'handoff', 'teach', 'escalate'
]);

const INTENT_RISKS = new Set(['low', 'medium', 'high', 'critical']);

const RISK_LEVEL = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });

const RISK_DISCLOSURE = Object.freeze({ low: 0, medium: 0.2, high: 0.5, critical: 0.8 });

function assertIntentShape(intent) {
  if (!intent || typeof intent !== 'object') throw new Error('CommunicationIntent is required.');
  if (!intent.senderAgentId) throw new Error('CommunicationIntent.senderAgentId is required.');
  if (!INTENT_PURPOSES.has(intent.purpose)) throw new Error(`Unsupported intent purpose '${intent.purpose}'.`);
  if (!INTENT_RISKS.has(intent.risk)) throw new Error(`Unsupported intent risk '${intent.risk}'.`);
  if (!intent.domain) throw new Error('CommunicationIntent.domain is required.');
}

function assertIntentContent(intent) {
  if (typeof intent.urgency !== 'number' || intent.urgency < 0 || intent.urgency > 1) {
    throw new Error('CommunicationIntent.urgency must be a number in [0, 1].');
  }
  if (intent.semanticRefs !== undefined && !Array.isArray(intent.semanticRefs)) {
    throw new Error('CommunicationIntent.semanticRefs must be an array.');
  }
}

function validateIntent(intent) {
  assertIntentShape(intent);
  assertIntentContent(intent);
}

function riskLevelOf(risk) {
  const known = RISK_LEVEL[risk];
  if (known === undefined) return 1;
  return known;
}

function disclosureOf(risk) {
  const known = RISK_DISCLOSURE[risk];
  if (known === undefined) return 0.2;
  return known;
}

function groundingFor(risk, requiresAction) {
  if (risk === 'critical') return 'human_confirmation';
  if (risk === 'high') return 'verified_ack';
  if (risk === 'medium') return requiresAction ? 'action_ack' : 'semantic_ack';
  return requiresAction ? 'semantic_ack' : 'none';
}

function scopeFor(count) {
  if (count <= 1) return 'UNICAST';
  if (count <= 8) return 'SELECTIVE_MULTICAST';
  return 'QUORUM';
}

function withoutSender(candidates, senderId) {
  return candidates.filter((candidate) => candidate.agentId !== senderId);
}

function unionUnknown(enriched) {
  const union = new Set();
  for (const candidate of enriched) {
    for (const ref of candidate.unknownRefs) union.add(ref);
  }
  return [...union];
}

function noveltyOf(unknownCount, totalRefs) {
  if (totalRefs <= 0) return 0.3;
  return unknownCount / totalRefs;
}

function topCapability(informed) {
  if (informed.length === 0) return 0.3;
  return informed[0].score;
}

function groundEstimateOf(candidate, totalRefs) {
  if (!candidate || totalRefs <= 0) return 0.5;
  return 1 - candidate.unknownRefs.length / totalRefs;
}

function computeGain(parts) {
  const raw = parts.novelty * parts.relevance * parts.actionability * parts.urgency * parts.capability;
  const stakes = 1 + 0.25 * parts.riskLevel;
  return raw * stakes * (0.5 + 0.5 * parts.baseRate);
}

function signalPriorOf() {
  const plane = getSignalPlaneMetrics();
  if (!plane || !plane.voi || plane.voi.totalSignals === 0) return null;
  return plane.voi.pDeltaDecision;
}

function baseRateOf() {
  try {
    const prior = signalPriorOf();
    if (prior === null) return 0.5;
    if (typeof prior !== 'number' || Number.isNaN(prior)) return 0.5;
    if (prior < 0) return 0;
    if (prior > 1) return 1;
    return prior;
  } catch (_) {
    return 0.5;
  }
}

function reasonCodesFor(selection, topScore, independenceRequired) {
  const codes = [...selection.reasonCodes];
  if (topScore > 0.6 && codes.indexOf('RECIPIENT_EXPERT') < 0) codes.push('RECIPIENT_EXPERT');
  if (independenceRequired && codes.indexOf('INDEPENDENCE_REQUIRED') < 0) codes.push('INDEPENDENCE_REQUIRED');
  return codes;
}

function silenceDecision(reasonCode, meta) {
  return {
    action: 'SILENCE', scope: 'SELF', recipients: [], encoding: 'semantic-fingerprint',
    grounding: 'none', ttlMs: 0, reasonCodes: [reasonCode], meta
  };
}

function necessityPass(intent) {
  if (!intent.requiresAction && intent.urgency < 0.15 && riskLevelOf(intent.risk) <= 1) return false;
  return true;
}

function audienceQueryOf(intent, refs, input) {
  return {
    db: input.db, senderId: intent.senderAgentId, domain: intent.domain,
    semanticRefs: refs, maxCandidates: input.maxCandidates,
    independenceFrom: intent.independenceRequired ? [intent.senderAgentId] : [],
    independenceThreshold: input.independenceThreshold, maxCost: input.maxCost, weights: input.weights
  };
}

function gainPartsOf(intent, novelty, capability) {
  return {
    novelty, relevance: 1, actionability: intent.requiresAction ? 1 : 0.4,
    urgency: intent.urgency, capability, riskLevel: riskLevelOf(intent.risk), baseRate: baseRateOf()
  };
}

function selectionOf(ctx) {
  return selectEncoding({
    novelty: ctx.novelty, purpose: ctx.intent.purpose, commonGround: ctx.ground,
    dialectAvailable: Boolean(ctx.input.dialectAvailable), riskLevel: riskLevelOf(ctx.intent.risk),
    trigger: ctx.input.trigger, negotiation: Boolean(ctx.input.negotiation),
    humanRequired: ctx.intent.risk === 'critical' && ctx.input.humanRequired !== false
  });
}

function costOf(ctx) {
  return estimateCost({
    encoding: ctx.selection.encoding, recipientCount: ctx.count, grounding: ctx.grounding,
    contaminationRisk: ctx.intent.independenceRequired ? 0.05 : 0.2,
    disclosureRisk: disclosureOf(ctx.intent.risk), coefficients: ctx.input.coefficients
  });
}

function finalizeDecision(ctx) {
  const ids = ctx.informed.map((candidate) => candidate.agentId);
  return {
    action: ctx.selection.action, scope: scopeFor(ids.length), recipients: ids,
    encoding: ctx.selection.encoding, grounding: ctx.grounding, ttlMs: ctx.input.ttlMs || 60000,
    reasonCodes: reasonCodesFor(ctx.selection, ctx.capability, Boolean(ctx.intent.independenceRequired)),
    meta: {
      utility: ctx.utility, gain: ctx.gain, cost: ctx.cost.total,
      breakdown: ctx.cost.breakdown, novelty: ctx.novelty, groups: ctx.groups
    }
  };
}

async function decideCommunication(input) {
  const intent = input.intent || {};
  validateIntent(intent);
  const refs = intent.semanticRefs || [];
  if (!necessityPass(intent)) {
    return silenceDecision('NOVELTY_LOW', { stage: 'necessity', utility: 0, gain: 0, cost: 0 });
  }
  const audience = await selectAudience(audienceQueryOf(intent, refs, input));
  const informed = withoutSender(audience.candidates, intent.senderAgentId);
  if (informed.length === 0) {
    return silenceDecision('COMMON_GROUND_HIGH', { stage: 'novelty', utility: 0, gain: 0, cost: 0 });
  }
  const novelty = noveltyOf(unionUnknown(informed).length, refs.length);
  const capability = topCapability(informed);
  const gain = computeGain(gainPartsOf(intent, novelty, capability));
  const selection = selectionOf({ intent, input, novelty, ground: groundEstimateOf(informed[0], refs.length) });
  if (selection.action === 'SILENCE') {
    return silenceDecision('NOVELTY_LOW', { stage: 'encoding', utility: 0, gain, cost: 0 });
  }
  const grounding = groundingFor(intent.risk, intent.requiresAction);
  const cost = costOf({ intent, input, selection, grounding, count: informed.length });
  const utility = gain - cost.total;
  if (utility <= 0) {
    return silenceDecision('TOKEN_SAVINGS', { stage: 'utility', utility, gain, cost: cost.total });
  }
  return finalizeDecision({
    intent, input, selection, grounding, informed, capability, utility, gain, cost, novelty, groups: audience.groups
  });
}

async function resolveDb(inputDb) {
  if (inputDb) return inputDb;
  return getDatabase();
}

async function ensureShadowTables(inputDb) {
  const db = await resolveDb(inputDb);
  await db.exec(`CREATE TABLE IF NOT EXISTS communication_shadow_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    intent_json TEXT NOT NULL DEFAULT '{}', decision_json TEXT NOT NULL DEFAULT '{}',
    current_behavior_json TEXT NOT NULL DEFAULT '{}',
    utility REAL NOT NULL DEFAULT 0, gain REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(intent_json)), CHECK (json_valid(decision_json))
  );`);
  return db;
}

function reductionOf(cost, naive) {
  if (naive.total <= 0) return 0;
  return 1 - cost / naive.total;
}

function naiveInputsOf(input) {
  const behavior = input.currentBehavior || {};
  return { recipientCount: behavior.recipientCount || 42, coefficients: input.coefficients };
}

function shadowRowOf(input) {
  const decision = input.decision || {};
  const meta = decision.meta || {};
  const naive = estimateNaiveBroadcast(naiveInputsOf(input));
  return {
    values: [
      JSON.stringify(input.intent || {}), JSON.stringify(decision),
      JSON.stringify(input.currentBehavior || {}),
      Number(meta.utility || 0), Number(meta.gain || 0), Number(meta.cost || 0)
    ],
    naive
  };
}

function shadowReceiptOf(result, logged) {
  return {
    id: result.lastID, utility: logged.values[3], gain: logged.values[4],
    cost: logged.values[5], naiveCost: logged.naive.total,
    reduction: reductionOf(logged.values[5], logged.naive)
  };
}

async function logShadowDecision(input) {
  const db = await ensureShadowTables(input.db);
  const logged = shadowRowOf(input);
  const result = await db.run(
    `INSERT INTO communication_shadow_log
      (intent_json, decision_json, current_behavior_json, utility, gain, cost)
     VALUES (?, ?, ?, ?, ?, ?)`,
    logged.values
  );
  return shadowReceiptOf(result, logged);
}

module.exports = { decideCommunication, logShadowDecision };
