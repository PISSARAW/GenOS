const express = require('express');
const router = express.Router();

/**
 * GET /api/qd/proxy — Quality-Diversity proxy endpoint.
 * Returns the current QD archive state (occupied/total niches).
 */
router.get('/proxy', async (req, res) => {
  res.json({
    niches: [],
    occupied: 0,
    total: 0,
    coverage: 0,
    message: 'QD archive empty — no candidates inserted yet'
  });
});

module.exports = router;
