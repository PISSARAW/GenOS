'use strict';

const authority = require('../trinityWorkerAuthority');
const preparation = require('../trinityDispatchPreparation');
const failure = () => Object.assign(new Error('Recovery must retain its sealed Trinity world and tenant.'),
  {code: 'TRINITY_RECOVERY_SCOPE_INVALID'});

async function sourceRoot(db, input) {
  const {source, target} = input;
  const agent = await db.get('SELECT * FROM agents WHERE id=?', source.id);
  const parent = await db.get('SELECT * FROM agents WHERE id=?', target.orchestratorId);
  if (!await authority.delegation(db, {agent, parent})) throw failure();
  return preparation.sourceFor(db, {parent, context: {id: source.id, orchestratorId: target.orchestratorId,
    request: {missionScope: target.mission.missionScope}}});
}

async function bind(db, input) {
  const {source, target, workspace} = input;
  await sourceRoot(db, input);
  const scope = target.mission.missionScope;
  const changed = await db.run(`UPDATE trinity_worlds SET agent_id=?, workspace_root=NULL,
    status='queued', updated_at=CURRENT_TIMESTAMP WHERE experiment_id=? AND agent_id=?`,
  target.targetId, scope.trinityExperimentId, source.id);
  if (changed.changes !== 1) throw failure();
  return preparation.bindWorker(db, {workerId: target.targetId, scope, workspaceRoot: workspace.workspaceRoot});
}

module.exports = {sourceRoot, bind};
