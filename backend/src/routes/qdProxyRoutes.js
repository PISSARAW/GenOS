const express = require('express');
const router = express.Router();

/**
 * GET /api/qd/proxy — Quality-Diversity proxy endpoint.
 * Refuses to claim an empty archive until a runtime archive is connected.
 */
router.get('/proxy', async (req, res) => {
  res.status(503).json({
    error: {
      code: 'QD_ARCHIVE_NOT_CONNECTED',
      message: 'Aucune archive QD runtime n’est connectée à ce proxy.'
    }
  });
});

module.exports = router;
