'use strict';

const { requirePermission } = require('./auth');
const forcePromotion = requirePermission('release:force_promote');

function requireForcePromotionPermission(req, res, next) {
  if (req.body?.force !== true) return next();
  return forcePromotion(req, res, next);
}

module.exports = { requireForcePromotionPermission };
