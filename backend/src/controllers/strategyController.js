const { listStrategies } = require('../strategies/strategyRegistry');
const { buildStrategyContract } = require('../services/strategyContractService');

function list(req, res) {
  const family = String(req.query.family || '').trim();
  const maturity = String(req.query.maturity || '').trim();
  const strategies = listStrategies().filter((strategy) => {
    if (family && strategy.family !== family) return false;
    if (maturity && strategy.maturity !== maturity) return false;
    return true;
  });
  res.json({ total: strategies.length, registryTotal: 77, strategies });
}

function preview(req, res) {
  try {
    res.json(buildStrategyContract(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: { code: 'STRATEGY_SELECTION_FAILED', message: error.message } });
  }
}

module.exports = { list, preview };
