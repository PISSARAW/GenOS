import { encoded } from './ui.mjs';
import { journeyRead, journeyAction } from './journeyView.mjs';
const root = '/api/studio/production';
const slotFields = [['workflowId', 'Workflow'], ['environment', 'Environnement : staging ou production', 'text', true, 'staging']];
const slotPath = data => root + '/workflows/' + encoded(data.workflowId) + '/slots/' + encoded(data.environment);
function fill(target, values) {
  for (const form of target.actions.querySelectorAll('form')) {
    for (const [key, value] of Object.entries(values)) if (form.elements[key]) form.elements[key].value = value ?? '';
  }
}
export function startDeployment(target) {
  journeyRead(target, { id: 'production-slot', title: 'Observer la version disponible et l’historique local',
    fields: slotFields, path: slotPath, after: data => {
      fill(target, { workflowId: data.workflowId, environment: data.environment, expectedRevision: data.revision });
      target.actions.querySelector('[data-action="production-invoke"]').elements.releaseHash.value = data.releaseHash || '';
    } });
  journeyAction(target, { id: 'production-publish', title: 'Publier la version dans le slot local', path: data => slotPath(data) + '/publish',
    fields: [...slotFields, ['releaseId', 'Release figée'], ['releaseHash', 'Empreinte attendue'],
      ['expectedRevision', 'Révision du slot attendue', 'number', true, '0'], ['reviewId', 'Revue requise en production', 'text', false], ['note', 'Motif de publication']],
    after: data => {
      fill(target, { environment: data.environment, expectedRevision: data.revision });
      target.actions.querySelector('[data-action="production-invoke"]').elements.releaseHash.value = data.releaseHash;
    },
    confirm: 'Remplacer la version admise localement sous contrôle de révision ? Les appels déjà admis ne seront pas annulés.' });
  journeyAction(target, { id: 'production-invoke', title: 'Appeler la version locale', permission: 'experiment:run', path: data => slotPath(data) + '/invoke',
    fields: [...slotFields, ['releaseHash', 'Empreinte attendue'], ['expectedRevision', 'Révision attendue', 'number', true, '0'],
      ['input', 'Entrées JSON', 'textarea', true, '{}']],
    after: data => fill(target, { runId: data.runId }),
    confirm: 'Mettre un appel réel en file pour cette version exacte ? Une admission ne garantit pas son exécution ou la vérité du résultat.' });
  journeyAction(target, { id: 'production-review', title: 'Consigner la revue de publication', path: data => root + '/releases/' + encoded(data.releaseId) + '/reviews',
    fields: [['releaseId', 'Release figée'], ['releaseHash', 'Empreinte examinée'], ['runId', 'Appel staging terminé'],
      ['decision', 'Décision : approved ou rejected', 'text', true, 'approved'], ['note', 'Justification de la revue']],
    after: data => fill(target, { reviewId: data.reviewId }),
    confirm: 'Consigner une revue valable une heure comme owner/admin du projet ? Elle ne valide pas la vérité du résultat ni une indépendance du réviseur.' });
  journeyAction(target, { id: 'production-rollback', title: 'Rétablir la version locale précédente', path: data => slotPath(data) + '/rollback',
    fields: [...slotFields, ['expectedRevision', 'Révision attendue', 'number', true, '0'], ['note', 'Motif de retour arrière']],
    after: data => fill(target, { expectedRevision: data.revision, releaseId: data.releaseId, releaseHash: data.releaseHash }),
    confirm: 'Rétablir le pointeur précédent pour les prochains appels ? Aucun appel déjà admis ni effet externe ne sera annulé.' });
}
