'use strict';

const agowSignals = require('./agowToGvxSignalAdapter');
const gvxReceipts = require('./gvxToAgowReceiptAdapter');
const interoception = require('./interoceptionBridge');
const scopes = require('./developmentalScopeResolver');
const receiptVerifier = require('./developmentReceiptVerifier');

function recommendAction(signalType, repetitionCount = 1) {
  if (!agowSignals.SIGNAL_TYPES.includes(signalType)) return 'ignore';
  if (signalType === 'active_query' || signalType === 'skill_gap'
      || signalType === 'counterfactual_discrimination') return 'schedule_experiment';
  if (signalType === 'pathway_decompiled' || signalType === 'representation_failure') return 'create_hypothesis';
  if (repetitionCount >= 3 && ['prediction_error', 'persistent_regret'].includes(signalType)) {
    return 'create_hypothesis';
  }
  return 'observe';
}

module.exports = { ...agowSignals, ...gvxReceipts, ...interoception, ...scopes, ...receiptVerifier, recommendAction };
