const { listStrategies } = require('../strategies/strategyRegistry');
const { buildStrategyContract } = require('../services/strategyContractService');
const { auditMission } = require('../services/orchestrationCoverageService');
const { getDatabase } = require('../db');

function list(req, res) {
  const family = String(req.query.family || '').trim();
  const maturity = String(req.query.maturity || '').trim();
  const strategies = listStrategies().filter((strategy) => {
    if (family && strategy.family !== family) return false;
    if (maturity && strategy.maturity !== maturity) return false;
    return true;
  });
  res.json({ total: strategies.length, registryTotal: listStrategies().length, strategies });
}

function preview(req, res) {
  try {
    res.json(buildStrategyContract(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: { code: 'STRATEGY_SELECTION_FAILED', message: error.message } });
  }
}

async function auditCoverage(req, res, next) {
  try {
    const orchestratorId = req.params?.orchestratorId || req.query?.orchestratorId || req.body?.orchestratorId;
    if (!orchestratorId) {
      return res.status(400).json({ error: { code: 'ORCHESTRATOR_ID_REQUIRED', message: 'orchestratorId is required' } });
    }
    const db = await getDatabase();
    const result = await auditMission(db, orchestratorId);
    res.json(result);
  } catch (error) {
    if (error.message && error.message.includes('No strategy contract')) {
      return res.status(404).json({ error: { code: 'STRATEGY_CONTRACT_NOT_FOUND', message: error.message } });
    }
    next(error);
  }
}

module.exports = { list, preview, auditCoverage };

