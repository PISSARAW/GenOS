'use strict';

function requests(input, output, ecology) {
  const direct = supplied(input, output);
  const pending = output.decision?.execution?.execution;
  if (!executable(pending?.operation)) return direct;
  const planned = materialize(pending, ecology);
  return planned ? [...direct, planned] : direct;
}

function supplied(input, output) {
  const direct = input.executions || [];
  const selected = output.decision?.selected;
  if (!selected || !input.computeWork) return direct;
  return [...direct, { ...input.computeWork, providerId: selected.id }];
}

function executable(operation) {
  return operation && typeof operation === 'object' && operation.providerId && operation.capability;
}

function materialize(pending, ecology) {
  const operation = pending.operation;
  const population = ecology.populations.find(p => p.populationId === pending.populationId);
  const individual = population?.individuals.find(i => i.capabilities.includes(operation.capability)
    && (!pending.individualId || i.individualId === pending.individualId));
  if (!individual) return null;
  return { executionId: pending.actionId, populationId: population.populationId,
    individualId: individual.individualId, providerId: operation.providerId,
    capability: operation.capability, resources: operation.resources || {}, input: operation.input || {} };
}

module.exports = { requests };
