const express = require('express');
const chargebackService = require('../services/chargebackService');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const cb = chargebackService.buildChargeback(req.body || {});
    res.status(201).json({ ok: true, chargeback: cb });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_INVALID' });
  }
});

router.post('/:id/line-items', (req, res) => {
  try {
    const { id } = req.params;
    const current = { schema: chargebackService.SCHEMA, chargeback_id: id, status: 'open', lineItems: [], total_amount_usd: 0 };
    const updated = chargebackService.addLineItem(current, req.body || {});
    res.json({ ok: true, chargeback: updated });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_LINE_ITEM_FAILED' });
  }
});

router.post('/:id/settle', (req, res) => {
  try {
    const { id } = req.params;
    const current = { schema: chargebackService.SCHEMA, chargeback_id: id, status: 'open', lineItems: [], total_amount_usd: 0 };
    const settled = chargebackService.settleChargeback(current, req.body && req.body.settledAt);
    const receipt = chargebackService.buildReceipt(settled);
    res.json({ ok: true, chargeback: settled, receipt });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_SETTLE_FAILED' });
  }
});

router.post('/aggregate', (req, res) => {
  try {
    const chargebacks = req.body && Array.isArray(req.body.chargebacks) ? req.body.chargebacks : [];
    const aggregation = chargebackService.aggregateChargebacks(chargebacks);
    res.json({ ok: true, aggregation });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'CHARGEBACK_AGGREGATE_FAILED' });
  }
});

module.exports = router;
