const crypto = require('crypto');
const { getDatabase } = require('../db');
const { scopeSql } = require('../middleware/tenant');
const runner = require('../services/frameworkRunner');

async function run(req, res, next) {
  try {
    const framework = String(req.params.framework || '').toLowerCase();
    if (!runner.FRAMEWORKS.has(framework)) return res.status(400).json({ error: { code: 'UNSUPPORTED_FRAMEWORK', message: 'Supported frameworks are langgraph, autogen, crewai, langfuse and phoenix.' } });
    const db = await getDatabase();
    const scope = scopeSql(req);
    const id = `framework-${crypto.randomUUID()}`;
    const traceId = crypto.randomUUID().replace(/-/g, '');
    await db.run('INSERT INTO framework_executions(id,organization_id,project_id,framework,trace_id,status,input_json) VALUES(?,?,?,?,?,?,?)', id, ...scope.params, framework, traceId, 'running', JSON.stringify(req.body?.input || {}));
    try {
      const result = await runner.execute(framework, req.body?.input || {}, req.body?.config || {}, { traceId });
      await db.run("UPDATE framework_executions SET status='completed',output_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?", JSON.stringify(result.output), id);
      res.status(201).json({ id, ...result });
    } catch (error) {
      await db.run("UPDATE framework_executions SET status='failed',error_json=?,completed_at=CURRENT_TIMESTAMP WHERE id=?", JSON.stringify({ message: error.message }), id);
      res.status(502).json({ error: { code: 'FRAMEWORK_EXECUTION_FAILED', message: error.message }, id, traceId });
    }
  } catch (error) { next(error); }
}

async function list(req, res, next) {
  try {
    const db = await getDatabase();
    const scope = scopeSql(req);
    const rows = await db.all(`SELECT * FROM framework_executions WHERE ${scope.clause} ORDER BY created_at DESC LIMIT 100`, ...scope.params);
    res.json(rows.map(row => ({ ...row, input: JSON.parse(row.input_json), output: row.output_json ? JSON.parse(row.output_json) : null, error: row.error_json ? JSON.parse(row.error_json) : null })));
  } catch (error) { next(error); }
}

module.exports = { run, list };
