import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';
export function startProduction() {
  const root = '/api/studio/production';
  const target = journeyView({ id: 'production', title: 'Publier et exploiter',
    intro: 'Figer une version puis observer ce que sert réellement l’adaptateur local, sans confondre publication et vérité.',
    steps: ['Choisir un workflow exécutable et une version persistée. Figer son graphe et ses métadonnées avec une empreinte.',
      'Inspecter la version avant toute publication. Une release préparée ne sert encore aucun trafic.',
      'Une publication exige ses préconditions et son autorité propres. Aucun déploiement cloud ou effet externe réversible n’est présumé.'] });
  journeyRead(target, { id: 'production-workflows', title: 'Lister les workflows du projet', path: () => root + '/workflows' });
  journeyAction(target, { id: 'production-freeze', title: 'Figer une version de release', path: () => root + '/releases',
    fields: [['workflowId', 'Workflow'], ['version', 'Version persistée', 'number', true, '1']],
    after: data => { target.actions.querySelector('[data-journey-read="production-inspect"]').elements.releaseId.value = data.releaseId; },
    confirm: 'Conserver une version immuable sans la publier ni valider ses résultats ?' });
  journeyRead(target, { id: 'production-inspect', title: 'Inspecter la release figée', fields: [['releaseId', 'Release']],
    path: data => root + '/releases/' + encoded(data.releaseId) });
  journeyLink(target, 'knowledge-view', 'Retrouver les décisions et preuves');
  journeyLink(target, 'recovery-view', 'Rejoindre Diagnostic et reprise');
  return target;
}
