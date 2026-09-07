const { getDatabase } = require('../db');
const agentConscience = require('../services/agentConscienceService');
const { boundedInteger } = require('./argumentBounds');

async function getAgentConscience(req, res, next) {
  try {
    const db = await getDatabase();
    const agent = await db.get('SELECT id, name, status, execution_mode FROM agents WHERE id = ?', req.params.id);
    if (!agent) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
    }
    const conscience = await agentConscience.loadConscienceState(db, req.params.id);
    res.json({
      agentId: req.params.id,
      agentName: agent.name,
      status: agent.status,
      executionMode: agent.execution_mode,
      conscience
    });
  } catch (error) {
    next(error);
  }
}

async function getConscienceTransitions(req, res, next) {
  try {
    const db = await getDatabase();
    const agent = await db.get('SELECT id, name FROM agents WHERE id = ?', req.params.id);
    if (!agent) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Agent ${req.params.id} not found` } });
    }
    const limit = boundedInteger(req.query.limit, 50, 1, 200);
    const offset = boundedInteger(req.query.offset, 0, 0, 1_000_000);
    const transitions = await agentConscience.getConscienceTransitions(db, req.params.id, { limit, offset });
    res.json({
      agentId: req.params.id,
      agentName: agent.name,
      count: transitions.length,
      limit,
      offset,
      transitions
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAgentConscience,
  getConscienceTransitions
};
