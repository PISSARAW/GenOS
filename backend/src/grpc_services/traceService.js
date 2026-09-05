const arena = require('../services/arenaService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Trace is alive via gRPC!" }),

  ExportTraces: (call, callback) => {
    const { tournament_id, format } = call.request || {};
    const trace = arena.exportTrace(tournament_id || 'tour-1', format || 'json-dag');
    callback(null, {
      trace_id: trace.traceId || 'trace-1',
      spans_json: JSON.stringify(trace.spans || [])
    });
  },

  GetTraceSpans: (call, callback) => {
    callback(null, { spans: ['span-start', 'span-execute', 'span-finish'] });
  }
};
