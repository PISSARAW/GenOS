'use strict';

const structuralHandlers = {
  structural_consolidation: async (ctx = {}) => {
    const { runConsolidationCycle } = require('../structuralConsolidationService');
    return runConsolidationCycle(ctx);
  },
  synaptic_graph_summary: async (ctx = {}) => {
    const { getSynapticGraphSummary } = require('../structuralConsolidationService');
    return getSynapticGraphSummary(ctx);
  },
  kg_record_relation: async (ctx = {}) => {
    const { recordRelation } = require('../structuralKnowledgeGraph');
    return recordRelation(ctx);
  },
  kg_outgoing_relations: async (ctx = {}) => {
    const { outgoingRelations } = require('../structuralKnowledgeGraph');
    return outgoingRelations(ctx);
  },
  kg_incoming_relations: async (ctx = {}) => {
    const { incomingRelations } = require('../structuralKnowledgeGraph');
    return incomingRelations(ctx);
  },
  kg_recommend_strategy: async (ctx = {}) => {
    const { recommendStrategy } = require('../structuralKnowledgeGraph');
    return recommendStrategy(ctx);
  },
  kg_search_traits: async (ctx = {}) => {
    const { searchTraits } = require('../structuralKnowledgeGraph');
    return searchTraits(ctx);
  }
};

module.exports = structuralHandlers;