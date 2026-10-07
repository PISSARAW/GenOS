import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';

export function startKnowledge() {
  const target = journeyView({ id: 'knowledge', title: 'Connaissances et mémoire',
    intro: 'Conserver une décision, inspecter ses sources et transmettre une expérience sans perdre son origine.',
    steps: ['Rechercher les décisions du projet par mots-clés : ce n’est pas un retrieval sémantique.',
      'Consigner le raisonnement et les références de provenance SHA-256. Sans référence, la décision reste provisoire.',
      'Inspecter l’intégrité puis transmettre à un agent du même projet. Intégrité et source liée ne prouvent ni vérité ni promotion.'] });
  journeyRead(target, { id: 'knowledge-search', title: 'Rechercher les mémoires du projet',
    fields: [['q', 'Mots-clés', 'text', false]], path: input => '/api/studio/memories?q=' + encoded(input.q) });
  journeyRead(target, { id: 'knowledge-inspect', title: 'Inspecter mémoire et provenance',
    fields: [['memoryId', 'Identifiant de mémoire']], path: input => '/api/studio/memories/' + encoded(input.memoryId) });
  journeyAction(target, { id: 'knowledge-record', title: 'Consigner une décision sourcée', path: () => '/api/studio/memories',
    fields: [['title', 'Titre'], ['content', 'Décision et justification', 'textarea'],
      ['evidence', 'Empreintes de provenance, séparées par virgules', 'textarea', false]],
    body: input => ({ title: input.title, content: input.content, evidenceRefs: input.evidence.split(',').map(item => item.trim()).filter(Boolean) }),
    after: data => {
      for (const input of target.actions.querySelectorAll('[name="memoryId"]')) input.value = data.id;
    } });
  journeyAction(target, { id: 'knowledge-transfer', title: 'Transmettre une expérience sourcée',
    fields: [['memoryId', 'Mémoire source'], ['targetAgentId', 'Agent destinataire'], ['reason', 'Raison de transmission', 'textarea']],
    path: input => '/api/studio/memories/' + encoded(input.memoryId) + '/transfer',
    body: input => ({ targetAgentId: input.targetAgentId, reason: input.reason }),
    confirm: 'Conserver une mémoire dérivée liée à sa source dans ce projet ? Cela ne valide pas son contenu.' });
  journeyLink(target, 'inspection', 'Inspecter la promotion et ses preuves');
}
