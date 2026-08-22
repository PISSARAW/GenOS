const { getDatabase } = require('../db');
const strategyExecution = require('../services/strategyExecutionService');
const telemetry = require('../services/telemetryObserver');

async function latest(req, res) {
  const db = await getDatabase();
  const agent = await db.get('SELECT id FROM agents WHERE id = ?', req.params.id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
  const run = await strategyExecution.getLatestRun(db, agent.id);
  if (!run) return res.status(404).json({ error: { code: 'NO_STRATEGY_EXECUTION', message: 'This agent has not executed a strategy contract yet.' } });
  res.json(run);
}

async function list(req, res) {
  const db = await getDatabase();
  res.json(await strategyExecution.listRuns(db, req.params.id));
}

async function approve(req, res) {
  const db = await getDatabase();
  try {
    const run = await strategyExecution.approveRun(db, req.params.runId);
    telemetry.emitEvent({
      eventType: 'STRATEGY_PROMOTION_APPROVED', agentId: run.agentId, action: 'APPROVE',
      detail: `Execution run ${run.id} approved for promotion.`,
      payload: { runId: run.id, contractId: run.contractId, approvedBy: req.user?.username || 'studio' }
    });
    res.json(run);
  } catch (error) {
    res.status(409).json({ error: { code: 'INVALID_EXECUTION_APPROVAL', message: error.message } });
  }
}

module.exports = { latest, list, approve };
