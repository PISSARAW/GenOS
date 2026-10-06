'use strict';

const { getProject } = require('./projectStore');
const { getControl } = require('./controlService');
const { compileMission } = require('./missionContextService');

function projectFingerprint(project) {
  return JSON.stringify([project.root_path, project.branch, project.objective, project.config_json]);
}

async function prepareMission(db, projectId) {
  const project = await getProject(db, projectId);
  if (!project) throw new Error('projet-introuvable');
  const control = await getControl(db, projectId);
  const held = ['paused', 'stopping', 'stopped'].includes(control?.mode) || project.state === 'STOPPED';
  return { fingerprint: projectFingerprint(project), mission: held ? null : compileMission(project) };
}

function preparationMatches(project, preparation) {
  return projectFingerprint(project) === preparation.fingerprint;
}

module.exports = { prepareMission, preparationMatches };
