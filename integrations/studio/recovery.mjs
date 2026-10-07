import { api } from './app.mjs';
import { byId, encoded, node } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';

let inspected = null;
let selectedSnapshot = null;
let confirmedStop = false;
const root = () => '/api/studio/agents/' + encoded(api.session.agent);

function previewPath(input) {
  if (!inspected) throw new Error('Chargez le diagnostic de l’agent avant de choisir une récupération.');
  return '/api/workspaces/' + encoded(inspected.workspaceId) + '/rollback-preview?snapshotId=' + encoded(input.snapshotId);
}

function openRecovery() {
  if (!inspected || !selectedSnapshot || !confirmedStop) {
    byId('message').textContent = 'Obtenez un arrêt confirmé et prévisualisez un snapshot avant d’ouvrir la restauration.';
    return;
  }
  const choice = byId('workspace-choice');
  if (choice.value !== inspected.workspaceId) {
    choice.value = inspected.workspaceId;
    choice.dispatchEvent(new Event('change'));
    if (choice.value !== inspected.workspaceId) return;
  }
  document.querySelector('[data-target="files-view"]').click();
  byId('restore-id').value = selectedSnapshot;
}

export function startRecovery() {
  const target = journeyView({ id: 'recovery', title: 'Diagnostic et reprise',
    intro: 'Observer un incident, vérifier l’arrêt et préparer une récupération dont la portée est connue.',
    steps: ['Lire incidents du projet, état persisté, processus observé et garanties d’exécution. Inconnu ne signifie pas arrêté.',
      'Consigner et tester une hypothèse au laboratoire. Le diagnostic n’est pas automatiquement établi.',
      'Demander un arrêt vérifié, puis prévisualiser un snapshot et rejoindre la restauration filesystem avec capture de sécurité. Les effets externes ne sont pas annulés.'] });
  journeyRead(target, { id: 'recovery-inspect', title: 'Charger incidents et diagnostic', path: () => root() + '/diagnostic',
    after: data => { inspected = data; selectedSnapshot = null; confirmedStop = false; } });
  journeyAction(target, { id: 'recovery-stop', title: 'Demander un arrêt vérifié', path: () => root() + '/stop', fields: [],
    permission: 'emergency_kill', body: () => ({ confirmed: true }),
    after: data => { confirmedStop = data.confirmed === true; },
    confirm: 'Demander l’arrêt vérifié de cet agent et de sa lignée ? Un runtime externe non vérifiable sera refusé.' });
  journeyRead(target, { id: 'recovery-preview', title: 'Prévisualiser le point de récupération',
    fields: [['snapshotId', 'Snapshot workspace']], path: previewPath,
    after: data => { selectedSnapshot = data.targetSnapshot.id; } });
  const open = node('button', 'Ouvrir la restauration du workspace inspecté');
  open.type = 'button';
  open.addEventListener('click', openRecovery);
  target.actions.append(open);
  journeyLink(target, 'research-view', 'Consigner une hypothèse et son test');
  window.addEventListener('studio:cleared', () => { inspected = null; selectedSnapshot = null; confirmedStop = false; });
}
