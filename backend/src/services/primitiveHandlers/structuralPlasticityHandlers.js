'use strict';

/**
 * @file structuralPlasticityHandlers.js
 * @description Handlers centralisés pour les outils structurels.
 *
 * Contient les handlers du Lot 14 (Knowledge Graph + Consolidation)
 * qui sont spread dans HANDLERS via ...structuralHandlers.
 */

const { recordRelation, outgoingRelations, incomingRelations, recommendStrategy, searchTraits } = require('../structuralKnowledgeGraph');
const { runConsolidationCycle, getSynapticGraphSummary } = require('../structuralConsolidationService');

const HANDLERS = {
  // Lot 14 — Knowledge Graph
  kg_record_relation: (ctx = {}) => recordRelation(ctx),
  kg_outgoing_relations: (ctx = {}) => outgoingRelations(ctx),
  kg_incoming_relations: (ctx = {}) => incomingRelations(ctx),
  kg_recommend_strategy: (ctx = {}) => recommendStrategy(ctx),
  kg_search_traits: (ctx = {}) => searchTraits(ctx),

  // Lot 14 — Consolidation
  structural_consolidation: (ctx = {}) => runConsolidationCycle(ctx),
  synaptic_graph_summary: (ctx = {}) => getSynapticGraphSummary(ctx)
};

module.exports = HANDLERS;
