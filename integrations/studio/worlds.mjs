import { api } from './app.mjs';
import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';
const root = () => '/api/studio/agents/' + encoded(api.session.agent);

export function startWorlds() {
  const target = journeyView({ id: 'worlds', title: 'Mondes et lignages',
    intro: 'Capturer un point de décision, créer une alternative et comparer les états observés.',
    steps: ['Capturer l’état de l’agent et le workspace associé : deux portées distinctes.',
      'Créer une référence de branche ou un clone inactif. Le clone partage le workspace : aucune isolation de fichiers garantie.',
      'Comparer les agents, puis examiner les preuves au laboratoire et la revue dans Exécutions. Aucun score ne promeut une branche.'] });
  journeyRead(target, { id: 'worlds-inspect', title: 'Charger lignage et checkpoints', path: () => root() + '/worlds' });
  journeyAction(target, { id: 'worlds-checkpoint', title: 'Capturer un checkpoint agent et workspace',
    path: () => root() + '/checkpoints', fields: [['reason', 'Raison du checkpoint']],
    after: data => { target.actions.querySelector('[data-action="worlds-branch"]').elements.fromCommitId.value = data.snapshotId; } });
  journeyAction(target, { id: 'worlds-branch', title: 'Créer une référence de branche', path: () => root() + '/branches',
    fields: [['refName', 'Nom de branche'], ['fromCommitId', 'Checkpoint source']],
    confirm: 'Créer cette référence sans exécuter ni promouvoir de candidat ?' });
  journeyAction(target, { id: 'worlds-clone', title: 'Créer un clone inactif', path: () => root() + '/clone', fields: [],
    confirm: 'Créer un agent inactif dans le même workspace ? Les fichiers ne sont pas isolés.',
    after: data => { target.actions.querySelector('[name="rightAgentId"]').value = data.clonedAgentId; } });
  journeyRead(target, { id: 'worlds-compare', title: 'Comparer les états des agents',
    fields: [['rightAgentId', 'Agent alternatif']], path: () => root() + '/compare',
    options: input => ({ method: 'POST', body: input }) });
  journeyLink(target, 'research-view', 'Examiner hypothèses et preuves au laboratoire');
  journeyLink(target, 'inspection', 'Ouvrir la revue de l’exécution');
}
