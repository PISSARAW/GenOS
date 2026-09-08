/**
 * GenOS Auth Routes
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireRole } = require('../middleware/auth');

router.post('/verify-token', authController.verifyToken);
router.post('/verify-override', authController.verifyToken);
router.get('/session', authController.getSession);
router.post('/login', (req, res, next) => {
  const { username, password } = req.body || {};
  if (username && password) return authController.loginWithPassword(req, res, next);
  return authController.login(req, res, next);
});
router.post('/login/password', authController.loginWithPassword);
router.get('/keys', requireRole(['admin']), authController.listKeys);
router.post('/keys', requireRole(['admin']), authController.createKey);
router.post('/keys/:id/revoke', requireRole(['admin']), authController.revokeKey);
router.post('/keys/:id/rotate', requireRole(['admin']), authController.rotateKey);
router.post('/sessions/:id/revoke', requireRole(['admin']), authController.revokeSession);

module.exports = router;
