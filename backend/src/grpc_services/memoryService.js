const vectorMemory = require('../services/vectorMemoryService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Memory is alive via gRPC!" }),

  StoreMemory: async (call, callback) => {
    try {
      const { id, content, embedding } = call.request || {};
      await vectorMemory.storeMemory(id || 'grpc-agent', content || '', embedding || null);
      callback(null, { success: true });
    } catch (err) {
      console.error('[StoreMemory Error]:', err.message);
      callback(null, { success: false });
    }
  },

  SearchMemory: async (call, callback) => {
    try {
      const { text, vector, limit } = call.request || {};
      const query = text || '';
      const searchRes = await vectorMemory.searchMemory(query, {
        vector: vector && vector.length > 0 ? vector : undefined,
        limit: Number.isInteger(limit) && limit > 0 ? limit : 5
      });
      const results = (searchRes.allScoredExperiences || []).map((e) => ({
        id: e.id || 'mem-1',
        content: e.summary || e.content || e.title || '',
        embedding: e.vector || []
      }));
      callback(null, { results });
    } catch (err) {
      callback(null, { results: [] });
    }
  },

  CherryPickGoldenPath: (call, callback) => {
    try {
      const turns = (call.request?.turns_json || []).map((t) => typeof t === 'string' ? JSON.parse(t) : t);
      const res = vectorMemory.cherryPickGoldenPath(turns);
      callback(null, {
        golden_path_json: JSON.stringify(res.goldenPathSteps || res.goldenPath || []),
        noise_reduction_pct: res.noiseReductionPercent || 0
      });
    } catch (err) {
      callback(null, { golden_path_json: '[]', noise_reduction_pct: 0 });
    }
  }
};
