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
router.post('/login', authController.login);
router.get('/keys', requireRole(['admin']), authController.listKeys);
router.post('/keys', requireRole(['admin']), authController.createKey);

module.exports = router;
