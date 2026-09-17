'use strict';

function espaceAbsolu({ system = {} } = {}) {
  return { framework: 'newtonian', system, absolute: true, dimensions: 3, homogeneous: true, description: 'L espace absolu fournit un repere immuable independant des corps.' };
}

function tempsAbsolu({ system = {} } = {}) {
  return { framework: 'newtonian', system, absolute: true, direction: 'uniform', independentOfMotion: true, description: 'Le temps absolu s ecoule uniformement independamment des evenements.' };
}

function mecaniqueClassique({ agent1, agent2, force } = {}) {
  if (!agent1 || !agent2) throw new Error('newtonianService.mecaniqueClassique requires agent1 and agent2');
  const magnitude = Number(force || 0);
  return { law: 'action-reaction', agent1, agent2, forceOnAgent1: magnitude, forceOnAgent2: -magnitude, inertia: true, description: 'Toute action produit une reaction opposee de meme intensite.' };
}

module.exports = { espaceAbsolu, tempsAbsolu, mecaniqueClassique };
