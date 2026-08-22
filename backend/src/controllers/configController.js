/**
 * GenOS Config & Profile Controller
 */

const os = require('os');
const { getDatabase } = require('../db');
const modelProvider = require('../services/modelProvider');

let customUsername = null;
let maxTokens = 500000;
let waveTime = 42;

async function getConfig(req, res) {
  const username = customUsername || process.env.USERNAME || (os.userInfo ? os.userInfo().username : 'operator');
  const db = await getDatabase();
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const wsCount = await db.get("SELECT COUNT(*) as count FROM workspaces");
  const telemetryRows = await db.all('SELECT payload_json FROM telemetry_events');
  const usedTokens = telemetryRows.reduce((total, row) => {
    try {
      const payload = JSON.parse(row.payload_json || '{}');
      return total + Number(payload.tokens || payload.totalTokens || payload.usage?.total_tokens || 0);
    } catch {
      return total;
    }
  }, 0);
  const hasUsageTelemetry = usedTokens > 0;

  res.json({
    version: '2.0.0-PROD',
    environment: 'production-local',
    customUsername: username,
    maxTokens,
    waveTime,
    budget: {
      usedTokens: hasUsageTelemetry ? usedTokens : null,
      maxTokens,
      percent: hasUsageTelemetry ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : null
    },
    activeAgents: agentCount ? agentCount.count : 0,
    totalWorkspaces: wsCount ? wsCount.count : 0,
    model: modelProvider.getModelStatus(),
    presets: [
      { id: 'standard', name: 'Standard Swarm', computeLimit: '500k tokens', nodes: 4 },
      { id: 'deep_solve', name: 'Deep Scientific Solver', computeLimit: '1.5M tokens', nodes: 8 },
      { id: 'security_redteam', name: 'Adversarial Security Arena', computeLimit: '2.0M tokens', nodes: 6 }
    ]
  });
}

function getModelStatus(req, res) {
  res.json(modelProvider.getModelStatus(req.query?.model));
}

async function testModel(req, res, next) {
  try {
    const prompt = String(req.body?.prompt || 'Reply with exactly: GENOS_MODEL_OK');
    const result = await modelProvider.generate({ model: req.body?.model, prompt, timeoutMs: Math.min(Number(req.body?.timeoutMs) || 30000, 120000) });
    res.json({ success: true, provider: result.provider, text: result.text, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } });
  } catch (error) {
    res.status(502).json({ error: { code: 'MODEL_EXECUTION_FAILED', message: error.message } });
  }
}

function updateProfile(req, res) {
  const { username } = req.body || {};
  if (username) {
    customUsername = username;
  }
  res.json({ success: true, username: customUsername || 'operator' });
}

function getBudget(req, res) {
  getConfig(req, res);
}

function updateBudget(req, res) {
  const { maxTokens: newMax } = req.body || {};
  if (newMax) {
    maxTokens = parseInt(newMax, 10);
  }
  res.json({
    success: true,
    maxTokens,
    percent: 0
  });
}

module.exports = {
  getConfig,
  getModelStatus,
  testModel,
  updateProfile,
  getBudget,
  updateBudget
};
