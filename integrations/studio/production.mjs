import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';
import { startDeployment } from './productionDeployment.mjs';
import { startProductionOperations } from './productionOperations.mjs';
export function startProduction() {
  const root = '/api/studio/production';
  const target = journeyView({ id: 'production', title: 'Publier et exploiter',
    intro: 'Figer une version puis observer ce que sert réellement l’adaptateur local, sans confondre publication et vérité.',
    steps: ['Choisir un workflow exécutable et une version persistée. Figer son graphe et ses métadonnées avec une empreinte.',
      'Publier en staging, appeler et observer le résultat avant la revue owner/admin. Une admission n’est pas une exécution terminée.',
      'Publier localement sous revue liée au hash, observer les appels puis conserver les retours pour une nouvelle version. Le rollback ne concerne que les prochains appels.'] });
  journeyRead(target, { id: 'production-workflows', title: 'Lister les workflows du projet', path: () => root + '/workflows' });
  journeyAction(target, { id: 'production-freeze', title: 'Figer une version de release', path: () => root + '/releases',
    fields: [['workflowId', 'Workflow'], ['version', 'Version persistée', 'number', true, '1']],
    after: data => {
      for (const form of target.actions.querySelectorAll('form')) {
        for (const key of ['releaseId', 'releaseHash', 'workflowId']) {
          if (form.elements[key] && !(key === 'releaseHash' && form.dataset.action === 'production-invoke')) form.elements[key].value = data[key];
        }
      }
    },
    confirm: 'Conserver une version immuable sans la publier ni valider ses résultats ?' });
  journeyRead(target, { id: 'production-inspect', title: 'Inspecter la release figée', fields: [['releaseId', 'Release']],
    path: data => root + '/releases/' + encoded(data.releaseId) });
  startDeployment(target);
  startProductionOperations(target);
  journeyLink(target, 'knowledge-view', 'Retrouver les décisions et preuves');
  journeyLink(target, 'recovery-view', 'Rejoindre Diagnostic et reprise');
  return target;
}
