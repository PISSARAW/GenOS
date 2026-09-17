'use strict';

function duree({ events = [] } = {}) {
  return { events, temporalMode: 'duration', measurableByClock: false, qualitativeContinuity: true, description: 'La duree est un temps vecu, continu et qualitatif, irreductible a une succession spatiale.' };
}

function elanVital({ system = {} } = {}) {
  return { system, principle: 'elan_vital', creativeEvolution: true, novelty: true, description: 'L elan vital exprime la puissance creatrice et imprevisible de la vie.' };
}

function intuition({ agent, object } = {}) {
  if (!agent || object === undefined) throw new Error('bergsonService.intuition requires agent and object');
  return { agent, object, method: 'intuition', directAccess: true, analyticalDecomposition: false, description: 'L intuition saisit directement la mobilite singuliere de son objet.' };
}

module.exports = { duree, elanVital, intuition };
