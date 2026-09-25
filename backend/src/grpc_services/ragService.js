const graphRag = require('../services/graphRagService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Rag is alive via gRPC!" }),

  QueryGraphRag: async (call, callback) => {
    try {
      const { query, limit, organization_id, project_id } = call.request || {};
      const res = await graphRag.queryKnowledgeGraph(query || '', { limit: limit || 5, organizationId: organization_id, projectId: project_id });
      callback(null, {
        context_nodes: (res.nodes || []).map((n) => typeof n === 'string' ? n : (n.label || n.id)),
        synthesis: res.synthesis || 'Knowledge synthesis ready.'
      });
    } catch (err) {
      callback(err);
    }
  },

  IngestDocument: async (call, callback) => {
    try {
      const { doc_id, text, organization_id, project_id } = call.request || {};
      const result = await graphRag.ingestDocument(doc_id || 'doc-1', text || '', { organizationId: organization_id, projectId: project_id });
      callback(null, {
        success: true,
        entities_extracted: result.entitiesCount || 1
      });
    } catch (err) {
      callback(null, { success: false, entities_extracted: 0 });
    }
  }
};
