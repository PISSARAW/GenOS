'use strict';

const values = require('./intermediateValueService');
const graph = require('./symbiontInteractionGraph');

async function publish(db, input = {}) {
  return values.publishIntermediateValue(db, input);
}

async function consume(db, input = {}) {
  return values.consumeIntermediateValue(db, input);
}

async function interactionGraph(db, input = {}) {
  return graph.buildSymbiontInteractionGraph(db, input);
}

module.exports = { publish, consume, interactionGraph };
