const graphRag = require('../services/graphRagService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Rag is alive via gRPC!" }),

  QueryGraphRag: async (call, callback) => {
    try {
      const { query, limit } = call.request || {};
      const res = await graphRag.queryKnowledgeGraph(query || '', limit || 5);
      callback(null, {
        context_nodes: (res.nodes || []).map((n) => typeof n === 'string' ? n : (n.label || n.id)),
        synthesis: res.synthesis || 'Knowledge synthesis ready.'
      });
    } catch (err) {
      callback(null, { context_nodes: [], synthesis: err.message });
    }
  },

  IngestDocument: async (call, callback) => {
    try {
      const { doc_id, text } = call.request || {};
      const result = await graphRag.ingestDocument(doc_id || 'doc-1', text || '');
      callback(null, {
        success: true,
        entities_extracted: result.entitiesCount || 1
      });
    } catch (err) {
      callback(null, { success: false, entities_extracted: 0 });
    }
  }
};
