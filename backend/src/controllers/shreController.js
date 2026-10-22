'use strict';

const { getDatabase } = require('../db');
const workflow = require('../services/securityRemediation/shreWorkflowService');

function endpoint(operation) {
  return async (req, res, next) => {
    try {
      const db = await getDatabase();
      const result = await operation(db, req.tenant, req);
      res.json({ success: true, result });
    } catch (error) {
      if (error.message?.startsWith('SHRE_')) return res.status(400).json({ error: { code: error.message, message: error.message } });
      next(error);
    }
  };
}

const create = endpoint((db, tenant, req) => workflow.createDiagnostic(db, tenant, {
  ...req.body, createdBy: req.user?.keyId || req.user?.username
}));
const plan = endpoint((db, tenant, req) => workflow.plan(db, tenant, req.params.caseId, req.body));
const simulate = endpoint((db, tenant, req) => workflow.simulate(db, tenant, req.params.caseId));
const authorize = endpoint((db, tenant, req) => workflow.authorize(db, tenant, req.params.caseId, {
  humanApproval: { approved: req.body?.humanApproval?.approved === true,
    approverId: req.user?.keyId || req.user?.username, evidenceRef: req.body?.humanApproval?.evidenceRef }
}));
const apply = endpoint((db, tenant, req) => workflow.apply(db, tenant, req.params.caseId));
const counterTest = endpoint((db, tenant, req) => workflow.counterTest(db, tenant, req.params.caseId));
const close = endpoint((db, tenant, req) => workflow.close(db, tenant, req.params.caseId, req.body));
const rollback = endpoint((db, tenant, req) => workflow.rollback(db, tenant, req.params.caseId, req.body));
const getCase = endpoint((db, tenant, req) => workflow.getCase(db, tenant, req.params.caseId));

module.exports = { create, plan, simulate, authorize, apply, counterTest, close, rollback, getCase };
