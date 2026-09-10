/**
 * GenOS Config & Profile Controller
 */

const os = require('os');
const { getDatabase } = require('../db');
const modelProvider = require('../services/modelProvider');
const localModelDiscovery = require('../services/localModelDiscovery');
const { sanitizeString } = require('../middleware/security');

const tenantConfig = new Map();
function configFor(req) {
  const key = `${req.tenant.organizationId}:${req.tenant.projectId}`;
  if (!tenantConfig.has(key)) tenantConfig.set(key, { customUsername: null, maxTokens: 500000, waveTime: 42 });
  return tenantConfig.get(key);
}

async function getConfig(req, res) {
  const config = configFor(req);
  const username = config.customUsername || process.env.USERNAME || (os.userInfo ? os.userInfo().username : 'operator');
  const db = await getDatabase();
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.status = 'running' AND w.organization_id = ? AND w.project_id = ?", req.tenant.organizationId, req.tenant.projectId);
  const wsCount = await db.get("SELECT COUNT(*) as count FROM workspaces WHERE organization_id = ? AND project_id = ?", req.tenant.organizationId, req.tenant.projectId);
  const usageRow = await db.get(`SELECT COALESCE(SUM(
    COALESCE(json_extract(payload_json, '$.tokens'), 0) +
    COALESCE(json_extract(payload_json, '$.totalTokens'), 0) +
    COALESCE(json_extract(payload_json, '$.usage.total_tokens'), 0)
  ), 0) AS usedTokens FROM telemetry_events WHERE organization_id = ? AND project_id = ?`, req.tenant.organizationId, req.tenant.projectId);
  const usedTokens = Number(usageRow?.usedTokens || 0);
  const hasUsageTelemetry = usedTokens > 0;

  res.json({
    version: '2.0.0-PROD',
    environment: 'production-local',
    customUsername: username,
    maxTokens: config.maxTokens,
    waveTime: config.waveTime,
    budget: {
      usedTokens: hasUsageTelemetry ? usedTokens : null,
      maxTokens: config.maxTokens,
      percent: hasUsageTelemetry ? Math.min(100, Math.round((usedTokens / config.maxTokens) * 100)) : null
    },
    activeAgents: agentCount ? agentCount.count : 0,
    totalWorkspaces: wsCount ? wsCount.count : 0,
    model: modelProvider.getModelStatus(),
    presets: [
      { id: 'standard', name: 'Standard Swarm', computeLimit: '500k tokens', nodes: 4 },
      { id: 'deep_solve', name: 'Deep Scientific Solver', computeLimit: '1.5M tokens', nodes: 8 },
      { id: 'security_redteam', name: 'Adversarial Security Arena', computeLimit: '2.0M tokens', nodes: 6 }
    ],
    // Quick-spawn mission templates consumed by the Agent Deployment view.
    quickScenarios: {
      debug: 'Debug current workspace errors and run test suites.',
      explain: 'Explain the workspace architecture and component lineage.',
      plan: 'Create a step-by-step implementation plan for new features.'
    }
  });
}

function getModelStatus(req, res) {
  res.json(modelProvider.getModelStatus(req.query?.model));
}

async function getLocalModels(req, res, next) {
  try {
    res.json({ models: await localModelDiscovery.discoverLocalModels({ force: req.query?.refresh === '1' }) });
  } catch (error) { next(error); }
}

async function testModel(req, res, next) {
  try {
    const prompt = String(req.body?.prompt || 'Reply with exactly: GENOS_MODEL_OK');
    const model = req.body?.model;
    let endpoint;
    if (model) {
      const configuration = modelProvider.modelConfiguration(model);
      const db = await getDatabase();
      const registered = await db.get('SELECT endpoint FROM provider_configs WHERE provider = ? AND model = ? AND enabled = 1', configuration.provider, configuration.modelName);
      endpoint = registered?.endpoint || undefined;
    }
    const result = await modelProvider.generate({ model, prompt, endpoint, timeoutMs: Math.min(Number(req.body?.timeoutMs) || 30000, 120000) });
    res.json({ success: true, provider: result.provider, text: result.text, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } });
  } catch (error) {
    res.status(502).json({ error: { code: 'MODEL_EXECUTION_FAILED', message: error.message } });
  }
}

function updateProfile(req, res) {
  const config = configFor(req);
  const { username } = req.body || {};
  if (username === undefined || !String(username).trim()) return res.status(400).json({ error: { code: 'USERNAME_REQUIRED', message: 'username is required.' } });
  config.customUsername = sanitizeString(String(username)).trim();
  res.json({ success: true, username: config.customUsername || 'operator' });
}

function getBudget(req, res) {
  getConfig(req, res);
}

async function updateBudget(req, res, next) {
  const config = configFor(req);
  const { maxTokens: newMax } = req.body || {};
  if (newMax !== undefined) {
    const parsed = Number(newMax);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 10_000_000) {
      return res.status(400).json({ error: { code: 'INVALID_MAX_TOKENS', message: 'maxTokens must be a positive integer no greater than 10000000.' } });
    }
    config.maxTokens = parsed;
  }
  try {
    const db = await getDatabase();
    const usageRow = await db.get(`SELECT COALESCE(SUM(COALESCE(json_extract(payload_json, '$.tokens'), 0) + COALESCE(json_extract(payload_json, '$.totalTokens'), 0) + COALESCE(json_extract(payload_json, '$.usage.total_tokens'), 0)), 0) AS usedTokens FROM telemetry_events WHERE organization_id = ? AND project_id = ?`, req.tenant.organizationId, req.tenant.projectId);
    const usedTokens = Number(usageRow?.usedTokens || 0);
    return res.json({ success: true, maxTokens: config.maxTokens, usedTokens: usedTokens > 0 ? usedTokens : null, percent: usedTokens > 0 ? Math.min(100, Math.round((usedTokens / config.maxTokens) * 100)) : null });
  } catch (error) { return next(error); }
}

module.exports = {
  getConfig,
  getModelStatus,
  getLocalModels,
  testModel,
  updateProfile,
  getBudget,
  updateBudget
};
