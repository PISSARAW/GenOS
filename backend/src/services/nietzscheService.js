'use strict';

function willToPower({ agent, drives = [] } = {}) {
  if (!agent) throw new Error('nietzscheService.willToPower requires agent');
  return { agent, drives, principle: 'will_to_power', affirmative: true, description: 'La volonte de puissance est une dynamique d interpretation, de croissance et d affirmation.' };
}

function eternalReturn({ state, cycles = 1 } = {}) {
  if (state === undefined) throw new Error('nietzscheService.eternalReturn requires state');
  return { state, cycles: Math.max(1, Number(cycles) || 1), criterion: 'affirmation', question: 'Pourrais-tu vouloir revivre cet instant indefiniment ?', description: 'L eternel retour sert d epreuve d affirmation de la vie.' };
}

function ubermensch({ agent } = {}) {
  if (!agent) throw new Error('nietzscheService.ubermensch requires agent');
  return { agent, mode: 'self_overcoming', values: 'created', ressentiment: false, description: 'L Ubermensch represente le depassement de soi et la creation de valeurs.' };
}

module.exports = { willToPower, eternalReturn, ubermensch };
