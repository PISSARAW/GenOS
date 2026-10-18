const express = require('express');
const methodContractService = require('../services/methodContractService');

const router = express.Router();

router.post('/', (req, res) => {
  try {
    const contract = methodContractService.buildMethodContract(req.body || {});
    res.status(201).json({ ok: true, contract });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'METHOD_CONTRACT_INVALID' });
  }
});

router.post('/:contractId/bind', (req, res) => {
  try {
    const { contractId } = req.params;
    const current = { schema: methodContractService.SCHEMA, method_id: contractId, status: 'draft', version: 1 };
    const bound = methodContractService.bindMethodContract(current, req.body || {});
    res.json({ ok: true, contract: bound });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'METHOD_CONTRACT_BIND_FAILED' });
  }
});

router.post('/:contractId/execute', (req, res) => {
  try {
    const { contractId } = req.params;
    const current = { schema: methodContractService.SCHEMA, method_id: contractId, status: 'bound', version: 1 };
    const result = methodContractService.executeMethodContract(current, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message, code: 'METHOD_CONTRACT_EXECUTE_FAILED' });
  }
});

module.exports = router;
