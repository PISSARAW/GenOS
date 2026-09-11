const { getDatabase } = require('../db');
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

  GetTraceSpans: async (call, callback) => {
    try {
      const db = await getDatabase();
      const spans = await db.all('SELECT name FROM trace_spans ORDER BY id DESC LIMIT 50');
      callback(null, { spans: spans.map((s) => s.name) });
    } catch (_) {
      callback(null, { spans: [] });
    }
  }
};
