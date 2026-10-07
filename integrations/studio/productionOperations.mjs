import { encoded } from './ui.mjs';
import { journeyRead, journeyAction } from './journeyView.mjs';
const releasePath = data => '/api/studio/production/releases/' + encoded(data.releaseId);
export function startProductionOperations(target) {
  journeyRead(target, { id: 'production-operations', title: 'Inspecter appels, revues et retours de cette release',
    fields: [['releaseId', 'Release à observer']], path: data => releasePath(data) + '/operations' });
  journeyRead(target, { id: 'production-run', title: 'Observer le résultat de cet appel',
    fields: [['releaseId', 'Release'], ['runId', 'Appel workflow']], path: data => releasePath(data) + '/runs/' + encoded(data.runId) });
  journeyAction(target, { id: 'production-feedback', title: 'Conserver un retour pour la prochaine version',
    fields: [['releaseId', 'Release'], ['runId', 'Appel concerné'], ['body', 'Retour — ne pas inclure de secrets', 'textarea']],
    path: data => releasePath(data) + '/feedback',
    confirm: 'Conserver ce retour attribué et lié à cette version comme mémoire provisoire, sans modifier ou promouvoir le système ?' });
}
