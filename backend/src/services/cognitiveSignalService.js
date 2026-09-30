'use strict';

const modelRouter = require('./modelRouter');

function cognitionPrompt(signal, context) {
  return [
    'Traite ce signal GenOS comme une demande de cognition. Propose une interprétation et une prochaine action bornée.',
    'Ne prétends pas avoir exécuté une action ni validé une preuve. Signale explicitement toute incertitude.',
    `Contexte structurel: ${JSON.stringify(context)}`,
    `Données du signal: ${JSON.stringify(signal.signalData || {})}`
  ].join('\n');
}

async function handleSignal(input) {
  const { db, agentId, signal, context } = input;
  if (!db || !agentId || signal?.llmRequired !== true) {
    throw Object.assign(new Error('A database, cognitive target, and llmRequired signal are required.'),
      { code: 'COGNITIVE_SIGNAL_INPUT_INVALID' });
  }
  const result = await modelRouter.generate({ db, agentId, prompt: cognitionPrompt(signal, context), priority: 'interactive' });
  return { agentId, signalId: signal.signalId, text: String(result.text || ''),
    provider: result.provider || null, model: result.model || null, route: result.route || null };
}

module.exports = { handleSignal };
