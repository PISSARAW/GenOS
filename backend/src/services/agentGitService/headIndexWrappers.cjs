'use strict';

const { getDatabase } = require('../../db');
const head = require('./headIndex.cjs');

async function stage(req, opts) {
  const db = await getDatabase();
  return head.stage({ db, req, agentId: opts?.agentId || req.body?.agentId, section: req.body?.section, items: req.body?.items });
}

async function unstage(req, opts) {
  const db = await getDatabase();
  return head.unstage({ db, req, agentId: opts?.agentId || req.body?.agentId, section: req.body?.section });
}

module.exports = { stage, unstage };
