'use strict';

const strategyExecutionController = require('../../../controllers/strategyExecutionController');

function createPromotionGateHandlers(req) {
  return { PROMOTION_GATE: ({ args }) => approveRun(req, args) };
}

function approveRun(req, args) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const response = {
      status(code) { status = code; return this; },
      json(body) {
        if (status >= 400) return reject(approvalError(status, body));
        return resolve(body);
      }
    };
    const approvalRequest = { ...req, params: { ...req.params, runId: args.runId }, body: args };
    strategyExecutionController.approve(approvalRequest, response).catch(reject);
  });
}

function approvalError(status, body) {
  const code = body?.error?.code || 'GCI_PROMOTION_APPROVAL_REJECTED';
  return Object.assign(new Error('Linked PROMOTION_GATE approval was rejected'), { code, status });
}

module.exports = { createPromotionGateHandlers };
