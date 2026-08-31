const fs = require('fs');
const path = require('path');
const os = require('os');
const { dialog } = require('electron');

const genosDir = path.join(os.homedir(), '.genos');
const workspacesFile = path.join(genosDir, 'workspaces.json');

if (!fs.existsSync(genosDir)) {
  fs.mkdirSync(genosDir, { recursive: true });
}
if (!fs.existsSync(workspacesFile)) {
  fs.writeFileSync(workspacesFile, JSON.stringify({ active: null, list: [] }));
}

function getWorkspaces() {
  try {
    const data = JSON.parse(fs.readFileSync(workspacesFile, 'utf8'));
    return data;
  } catch (e) {
    return { active: null, list: [] };
  }
}

function saveWorkspaces(data) {
  fs.writeFileSync(workspacesFile, JSON.stringify(data, null, 2));
}

async function addWorkspace() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: "Sélectionner ou Créer un Workspace GenOS"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const newPath = result.filePaths[0];
  const data = getWorkspaces();
  if (!data.list.includes(newPath)) {
    data.list.push(newPath);
  }
  data.active = newPath;
  saveWorkspaces(data);
  return data;
}

function setActiveWorkspace(workspacePath) {
  const data = getWorkspaces();
  if (data.list.includes(workspacePath)) {
    data.active = workspacePath;
    saveWorkspaces(data);
  }
  return data;
}

module.exports = { getWorkspaces, addWorkspace, setActiveWorkspace };
