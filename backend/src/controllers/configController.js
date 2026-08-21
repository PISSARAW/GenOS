/**
 * GenOS Config & Profile Controller
 */

const os = require('os');
const { getDatabase } = require('../db');

let customUsername = null;
let maxTokens = 500000;
let waveTime = 42;

async function getConfig(req, res) {
  const username = customUsername || process.env.USERNAME || (os.userInfo ? os.userInfo().username : 'operator');
  const db = await getDatabase();
  const agentCount = await db.get("SELECT COUNT(*) as count FROM agents WHERE status = 'running'");
  const wsCount = await db.get("SELECT COUNT(*) as count FROM workspaces");

  res.json({
    version: '2.0.0-PROD',
    environment: 'production-local',
    customUsername: username,
    maxTokens,
    waveTime,
    budget: {
      usedTokens: 142850,
      maxTokens,
      percent: Math.min(100, Math.round((142850 / maxTokens) * 100))
    },
    activeAgents: agentCount ? agentCount.count : 4,
    totalWorkspaces: wsCount ? wsCount.count : 4,
    presets: [
      { id: 'standard', name: 'Standard Swarm', computeLimit: '500k tokens', nodes: 4 },
      { id: 'deep_solve', name: 'Deep Scientific Solver', computeLimit: '1.5M tokens', nodes: 8 },
      { id: 'security_redteam', name: 'Adversarial Security Arena', computeLimit: '2.0M tokens', nodes: 6 }
    ]
  });
}

function updateProfile(req, res) {
  const { username } = req.body || {};
  if (username) {
    customUsername = username;
  }
  res.json({ success: true, username: customUsername || 'operator' });
}

function getBudget(req, res) {
  const usedTokens = 142850;
  res.json({
    usedTokens,
    maxTokens,
    percent: Math.min(100, Math.round((usedTokens / maxTokens) * 100))
  });
}

function updateBudget(req, res) {
  const { maxTokens: newMax } = req.body || {};
  if (newMax) {
    maxTokens = parseInt(newMax, 10);
  }
  res.json({
    success: true,
    maxTokens,
    percent: Math.min(100, Math.round((142850 / maxTokens) * 100))
  });
}

module.exports = {
  getConfig,
  updateProfile,
  getBudget,
  updateBudget
};
