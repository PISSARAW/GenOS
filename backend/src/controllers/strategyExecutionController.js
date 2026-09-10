const { getDatabase } = require('../db');
const strategyExecution = require('../services/strategyExecutionService');
const telemetry = require('../services/telemetryObserver');
const signatureService = require('../services/promotionSignatureService');
const approvalPolicy = require('../services/platformApprovalPolicy');

async function scopedAgent(db, req, agentId) {
  const tenant = req.tenant;
  return db.get(
    tenant
      ? 'SELECT a.id FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=? AND w.organization_id=? AND w.project_id=?'
      : 'SELECT a.id FROM agents a JOIN workspaces w ON w.id=a.workspace_id WHERE a.id=? AND w.organization_id IS NULL AND w.project_id IS NULL',
    ...(tenant ? [agentId, tenant.organizationId, tenant.projectId] : [agentId])
  );
}

async function latest(req, res) {
  const db = await getDatabase();
  const agent = await scopedAgent(db, req, req.params.id);
  if (!agent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
  const run = await strategyExecution.getLatestRun(db, agent.id);
  if (!run) return res.status(404).json({ error: { code: 'NO_STRATEGY_EXECUTION', message: 'This agent has not executed a strategy contract yet.' } });
  res.json(run);
}

async function list(req, res) {
  const db = await getDatabase();
  if (!await scopedAgent(db, req, req.params.id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
  res.json(await strategyExecution.listRuns(db, req.params.id));
}

async function runRequester(db, runId) {
  const row = await db.get('SELECT c.created_by AS createdBy FROM strategy_execution_runs r JOIN strategy_contracts c ON c.id = r.contract_id WHERE r.id = ?', runId);
  if (!row) return '';
  return row.createdBy || '';
}

async function approve(req, res) {
  const db = await getDatabase();
  try {
    const candidate = await db.get('SELECT agent_id FROM strategy_execution_runs WHERE id=?', req.params.runId);
    if (!candidate || !await scopedAgent(db, req, candidate.agent_id)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution run not found' } });

    // Cryptographic signature validation for human approval gate
    const { signature, timestamp, signerId } = req.body || {};
    try {
      signatureService.validateSignature({ runId: req.params.runId, timestamp, signerId }, signature);
    } catch (sigErr) {
      return res.status(403).json({ error: { code: 'UNAUTHORIZED_PROMOTION', message: sigErr.message } });
    }

    // Separation of duties (point #8): the identity that requested the run
    // (contract created_by) cannot approve its own promotion, whatever
    // identity form (keyId or username) each side presents.
    const requester = await runRequester(db, req.params.runId);
    const deciders = approvalPolicy.decisionIdentities(req.user).concat([signerId]);
    if (approvalPolicy.matchesAnyIdentity(requester, deciders)) {
      return res.status(409).json({ error: { code: 'APPROVAL_SEPARATION_REQUIRED', message: 'The run requester cannot approve its own promotion.' } });
    }

    const run = await strategyExecution.approveRun(db, req.params.runId);
    telemetry.emitEvent({
      eventType: 'STRATEGY_PROMOTION_APPROVED', agentId: run.agentId, action: 'APPROVE',
      detail: `Execution run ${run.id} approved for promotion.`,
      payload: { runId: run.id, contractId: run.contractId, approvedBy: signerId || req.user?.username || 'studio' }
    });
    res.json(run);
  } catch (error) {
    res.status(409).json({ error: { code: 'INVALID_EXECUTION_APPROVAL', message: error.message } });
  }
}

module.exports = { latest, list, approve };
