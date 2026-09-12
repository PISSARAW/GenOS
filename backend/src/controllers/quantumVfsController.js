/**
 * @file quantumVfsController.js
 * @description Contrôleur Express pour l'API REST du Quantum VFS de GenOS.
 * Expose les capacités de manipulation quantique de fichiers aux interfaces et agents.
 */

const quantumVfsService = require('../services/quantumVfsService');
const { ObservableTrigger } = require('../services/quantumVfs');

async function stageFile(req, res, next) {
  try {
    const { workspaceId = 'default_workspace', filePath, content, options } = req.body || {};
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENTS', message: 'filePath et content sont requis.' } });
    }
    const result = quantumVfsService.stageQuantumFile(workspaceId, filePath, content, options || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function superposeHypothesis(req, res, next) {
  try {
    const { workspaceId = 'default_workspace', filePath, label, content, weight = 1.0, metadata = {} } = req.body || {};
    if (!filePath || !label || content === undefined) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENTS', message: 'filePath, label et content sont requis.' } });
    }
    const result = quantumVfsService.superposeHypothesis(workspaceId, filePath, label, content, weight, metadata);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function entangleFiles(req, res, next) {
  try {
    const { workspaceId = 'default_workspace', pathA, pathB, mode, rules } = req.body || {};
    if (!pathA || !pathB) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENTS', message: 'pathA et pathB sont requis.' } });
    }
    const result = quantumVfsService.entangleFiles(workspaceId, pathA, pathB, mode, rules);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function tunnelWrite(req, res, next) {
  try {
    const { workspaceId = 'default_workspace', filePath, content, agentEnergy = 1.0 } = req.body || {};
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: { code: 'INVALID_ARGUMENTS', message: 'filePath et content sont requis.' } });
    }
    const result = quantumVfsService.tunnelWrite(workspaceId, filePath, content, agentEnergy);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function triggerDecoherence(req, res, next) {
  try {
    const { workspaceId = 'default_workspace', trigger = ObservableTrigger.PERSISTENCE_FLUSH, options = {} } = req.body || {};
    const result = await quantumVfsService.triggerDecoherence(workspaceId, trigger, options);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const workspaceId = req.query.workspaceId || req.params.workspaceId || 'default_workspace';
    const result = quantumVfsService.getMetrics(workspaceId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function reset(req, res, next) {
  try {
    const { workspaceId } = req.body || {};
    const result = quantumVfsService.reset(workspaceId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  stageFile,
  superposeHypothesis,
  entangleFiles,
  tunnelWrite,
  triggerDecoherence,
  getMetrics,
  reset
};
