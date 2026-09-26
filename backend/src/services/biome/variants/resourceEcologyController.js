'use strict';

const allocator = require('../resources/resourceStewardService');
const { RESOURCE_KEYS } = require('../constants');

function advance(ecology, input) {
  const requested = vector(input.requested);
  const available = input.available ? vector(input.available) : ecology.resourcePool;
  return { decision: { requested, available, deficits: deficits(requested, available),
    starvingPopulationIds: starving(ecology), market: marketResult(ecology, input),
    allocation: allocationResult(ecology, input), productivityFeedback: feedback(ecology.populations) },
    action: { type: input.allocate ? 'RESOURCE_ECOSYSTEM_REGULATED' : 'RESOURCE_SCARCITY_ASSESSED', status: 'applied' } };
}

function deficits(requested, available) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, requested[key] - available[key])]));
}

function starving(ecology) {
  return ecology.populations.filter((population) => RESOURCE_KEYS.some((key) => belowNicheMinimum(ecology, population, key)))
    .map((population) => population.populationId);
}

function belowNicheMinimum(ecology, population, key) {
  const niche = ecology.niches.find((item) => item.nicheId === population.nicheId);
  return population.resourcePool[key] < (niche?.resourceProfile?.[key]?.minimum || 0);
}

function marketResult(ecology, input) { return input.market === true ? clearMarket(ecology, input.bids) : null; }
function allocationResult(ecology, input) {
  return input.allocate === true ? allocator.allocate(ecology, {
    resources: input.resources, reserveRatios: input.reserveRatios, signals: input.productivitySignals
  }) : null;
}

function clearMarket(ecology, bids) {
  const offers = Array.isArray(bids) ? bids : [];
  const clearing = {};
  for (const resource of RESOURCE_KEYS) {
    const ranked = rankBids(offers, ecology, resource);
    let remaining = ecology.resourcePool[resource];
    const winners = [];
    for (const bid of ranked) {
      const purchase = makePurchase({ ecology, bid, resource, remaining });
      const { quantity, amountPaid } = purchase;
      if (!quantity) break;
      credit(ecology, purchase);
      remaining -= quantity;
      winners.push({ populationId: bid.populationId, quantity, bid: bid.bid, amountPaid });
    }
    ecology.resourcePool[resource] = remaining;
    if (winners.length) clearing[resource] = { winners, clearingPrice: winners.at(-1).bid, remaining };
  }
  return clearing;
}

function rankBids(offers, ecology, resource) {
  return offers.filter((bid) => validBid(bid, ecology, resource))
    .sort((a, b) => b.bid - a.bid || a.populationId.localeCompare(b.populationId));
}

function validBid(bid, ecology, resource) {
  const known = ecology.populations.some((population) => population.populationId === bid.populationId);
  return bid.resource === resource && known && Number.isFinite(bid.bid) && bid.bid >= 0
    && Number.isFinite(bid.quantity) && bid.quantity > 0;
}

function makePurchase(options) {
  const { ecology, bid, resource, remaining } = options;
  const population = ecology.populations.find((item) => item.populationId === bid.populationId);
  const maxSpend = Math.max(0, population.resourcePool.costUsd || 0);
  const quantity = Math.min(remaining, bid.quantity, bid.bid > 0 ? maxSpend / bid.bid : bid.quantity);
  return { populationId: bid.populationId, resource, quantity, amountPaid: quantity * bid.bid };
}

function credit(ecology, purchase) {
  const { populationId, resource, quantity, amountPaid } = purchase;
  ecology.populations = ecology.populations.map((population) => population.populationId === populationId
    ? { ...population, resourcePool: { ...population.resourcePool, [resource]: population.resourcePool[resource] + quantity,
      costUsd: Math.max(0, population.resourcePool.costUsd - amountPaid) } }
    : population);
}

function feedback(populations) {
  return Object.fromEntries(populations.map((population) => [population.populationId, {
    productivity: population.productivity, marginalProductivity: population.marginalProductivity,
    nextAllocationWeight: Math.max(0, population.marginalProductivity || population.productivity || 0)
  }]));
}

function vector(value = {}) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, finiteNonNegative(value?.[key])]));
}

function finiteNonNegative(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }

module.exports = { advance };
