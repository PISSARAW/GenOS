import { api, perform } from './app.mjs';
import { byId, encoded, node, displayList } from './ui.mjs';

let opened = null;
let baseline = '';
const root = () => '/api/workspaces/' + encoded(byId('workspace-choice').value);
const endpoint = () => root() + '/file?path=' + encoded(byId('file-path').value);

function reset() {
  opened = null;
  baseline = '';
  byId('file-content').value = '';
  byId('file-path').value = '';
}

async function listFiles() {
  const data = await api.request(root() + '/editor-files');
  byId('file-list').replaceChildren(...data.files.map(file => {
    const item = node('li');
    const button = node('button', file.path);
    button.type = 'button';
    button.addEventListener('click', () => {
      if (byId('file-content').value !== baseline && !window.confirm('Abandonner les modifications non sauvegardées ?')) return;
      byId('file-path').value = file.path;
      perform(openFile);
    });
    item.append(button);
    return item;
  }));
  byId('file-result').textContent = data.truncated ? 'Liste limitée à 250 fichiers / 5 000 entrées.' : 'Fichiers du workspace chargé.';
  const snapshots = await api.request(root() + '/snapshots');
  const items = Array.isArray(snapshots) ? snapshots : snapshots.snapshots || [];
  displayList('editor-snapshots', items, snapshot => `${snapshot.id} · ${snapshot.label}`);
}

async function openFile() {
  const data = await api.request(endpoint());
  opened = { path: data.path, version: data.version, workspace: byId('workspace-choice').value };
  baseline = data.content;
  byId('file-content').value = data.content;
  byId('file-result').textContent = 'Version chargée : ' + data.version;
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

async function saveFile() {
  const workspace = byId('workspace-choice').value;
  const path = byId('file-path').value;
  const version = opened?.path === path && opened.workspace === workspace ? opened.version : 'missing';
  const response = await api.request(endpoint(), { method: 'PUT',
    body: { version, contentBase64: base64(byId('file-content').value) } });
  opened = { path, workspace, version: response.version };
  baseline = byId('file-content').value;
  byId('file-result').textContent = 'Sauvegarde vérifiée : ' + response.version;
}

function previewDiff() {
  const before = baseline.split('\n');
  const after = byId('file-content').value.split('\n');
  const changes = [];
  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    if (before[index] === after[index]) continue;
    if (before[index] !== undefined) changes.push(`- ${index + 1}: ${before[index]}`);
    if (after[index] !== undefined) changes.push(`+ ${index + 1}: ${after[index]}`);
  }
  byId('file-diff').textContent = changes.join('\n') || 'Aucun changement.';
}

export function startFiles() {
  window.addEventListener('studio:cleared', reset);
  byId('workspace-choice').addEventListener('change', reset);
  byId('files-refresh').addEventListener('click', () => perform(listFiles));
  byId('file-open').addEventListener('click', () => perform(openFile));
  byId('file-save').addEventListener('click', () => perform(saveFile));
  byId('file-diff-button').addEventListener('click', previewDiff);
  byId('editor-snapshot').addEventListener('click', () => perform(async () => {
    await api.request(root() + '/snapshots', { body: { label: 'Studio editor', reason: 'Capture manuelle' } });
    await listFiles();
  }));
  byId('restore-preview').addEventListener('click', () => perform(async () => {
    const data = await api.request(root() + '/rollback-preview?snapshotId=' + encoded(byId('restore-id').value));
    byId('restore-result').textContent = JSON.stringify(data, null, 2);
  }));
  byId('restore').addEventListener('click', () => {
    if (!window.confirm('Restaurer ce snapshot ? Un snapshot de sécurité sera capturé avant restauration.')) return;
    perform(async () => {
      const data = await api.request(root() + '/restore', { body: { snapshotId: byId('restore-id').value } });
      reset();
      byId('restore-result').textContent = JSON.stringify(data, null, 2);
      await listFiles();
    });
  });
}
