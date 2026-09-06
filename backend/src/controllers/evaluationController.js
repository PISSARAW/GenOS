const service = require('../services/evaluationObservabilityService');
exports.getOverview = async (req, res, next) => { try { res.json(await service.overview(req.tenant)); } catch (e) { next(e); } };
exports.runImpossibleBench = async (req, res, next) => { try { res.json(await service.runImpossibleBench({ ...(req.body || {}), ...req.tenant })); } catch (e) { next(e); } };
exports.pruneNode = async (req, res, next) => { try { const result = await service.pruneNode(req.params.id, req.tenant); if (!result) return res.status(404).json({ error: { message: 'MCTS node not found' } }); res.json(result); } catch (e) { next(e); } };
exports.updateNotifications = async (req, res, next) => { try { res.json(await service.updateNotifications(req.body?.preferences, req.tenant)); } catch (e) { next(e); } };
