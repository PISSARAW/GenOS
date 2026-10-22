'use strict';

const { getDatabase } = require('../db');
const perception = require('../services/securityPerception/securityPerceptionService');

function tenant(req) {
  if (!req.tenant) throw new Error('ASP_TENANT_SCOPE_REQUIRED');
  return req.tenant;
}

function endpoint(operation) {
  return async (req, res, next) => {
    try {
      const db = await getDatabase();
      const result = await operation(db, tenant(req), req);
      res.json({ success: true, result });
    } catch (error) {
      if (error.message?.startsWith('ASP_')) return res.status(400).json({ error: { code: error.message, message: error.message } });
      next(error);
    }
  };
}

const registerSensor = endpoint((db, scope, req) => perception.registerSensor(db, scope, req.body));
const observe = endpoint((db, scope, req) => perception.observe(db, scope, req.body));
const state = endpoint((db, scope) => perception.getState(db, scope));
const recordIncident = endpoint((db, scope, req) => perception.recordIncident(db, scope, req.body));
const calibrate = endpoint((db, scope, req) => perception.recordCalibrationOutcome(db, scope, req.body));
const updateWorld = endpoint((db, scope, req) => perception.updateWorld(db, scope, req.body));
const getWorld = endpoint((db, scope, req) => perception.getWorld(db, scope, req.query));

module.exports = { registerSensor, observe, state, recordIncident, calibrate, updateWorld, getWorld };
