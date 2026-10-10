const vectorMemory = require('../services/vectorMemoryService');
const authority = require('./memoryAuthorization');

function searchResult(entry) {
  return {
    id: entry.id,
    content: entry.summary || entry.content || entry.title || '',
    embedding: entry.vector || []
  };
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Memory is alive via gRPC!" }),

  StoreMemory: async (call, callback) => {
    try {
      const tenant = await authority.authorize(call, { write: true });
      const { id, content, embedding } = call.request || {};
      const storedId = await vectorMemory.storeMemory(tenant.principalId, content || '', embedding?.length ? embedding : null, {
        id: id || undefined, organizationId: tenant.organizationId, projectId: tenant.projectId,
        title: 'gRPC Memory'
      });
      callback(null, { success: true, memory_id: storedId });
    } catch (err) {
      callback(authority.errorStatus(err));
    }
  },

  SearchMemory: async (call, callback) => {
    try {
      const tenant = await authority.authorize(call);
      const options = authority.searchOptions(call);
      const query = call.request?.text || '';
      const searchRes = await vectorMemory.searchMemory(query, { ...options,
        organizationId: tenant.organizationId, projectId: tenant.projectId });
      const results = (searchRes.allScoredExperiences || []).slice(0, options.limit).map(searchResult);
      callback(null, { results });
    } catch (err) {
      callback(authority.errorStatus(err));
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
