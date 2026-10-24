'use strict';

const { getDatabase } = require('./agentGitDb.cjs');
const head = require('./headIndex.cjs');

async function stage(req, opts) {
  const db = await getDatabase();
  const agentId = opts?.agentId || req.body?.agentId;
  const section = req.body?.section;
  if (!require('./stagingPolicy.cjs').stageable(section)) {
    return { success: false, error: 'A supported state section is required.' };
  }
  const state = await require('./index').collectState(db, req, agentId);
  if (!state) return { success: false, error: 'Agent is unavailable in the current tenant.' };
  const items = state[section] || (section === 'agent' ? state.agent : []);
  if (req.body?.items !== undefined && JSON.stringify(req.body.items) !== JSON.stringify(items)) {
    return { success: false, error: 'Staged items must match the current scoped state.' };
  }
  const refName = req.body?.refName || 'main';
  const ref = await db.get('SELECT object_id, version FROM agent_git_refs WHERE agent_id = ? AND ref_name = ?', agentId, refName);
  return head.stage({ db, req, agentId, section, items, refName,
    baseObjectId: ref?.object_id || null, baseRefVersion: Number(ref?.version || 0) });
}

async function unstage(req, opts) {
  const db = await getDatabase();
  return head.unstage({ db, req, agentId: opts?.agentId || req.body?.agentId, section: req.body?.section });
}

module.exports = { stage, unstage };
