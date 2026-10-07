import { api } from './app.mjs';
import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';

export function startCollective(parent) {
  const root = () => '/api/studio/agents/' + encoded(api.session.agent) + '/collective';
  const target = journeyView({ id: 'collective', title: 'Topologies et organisations', parent,
    intro: 'Comparer les contrats collectifs et calculer un pas borné avant toute configuration runtime.',
    steps: ['Inspecter les catalogues réels et la configuration persistée de cet agent.',
      'Distinguer capacités requises, disponibles, autorisées et exercées. Le catalogue ne prouve pas une exécution.',
      'Calculer un pas sur données déclarées, conservé comme analyse provisoire. Aucun worker, routage ou budget réel n’est modifié.'] });
  journeyRead(target, { id: 'collective-inspect', title: 'Inspecter contrats et configuration', path: root });
  journeyAction(target, { id: 'collective-step', title: 'Calculer et conserver un pas collectif', path: () => root() + '/step',
    fields: [['organization', 'Organisation du catalogue', 'text', true, 'quorum_with_abstention'],
      ['state', 'Données déclarées JSON (100 éléments par liste maximum)', 'textarea', true,
        '{"votes":[{"support":true},{"abstain":true}]}']],
    confirm: 'Conserver une analyse sur données déclarées sans l’appliquer au runtime ?' });
  journeyLink(target, 'organism-view', 'Retour à Organisme et AgentDNA');
  journeyLink(target, 'research-view', 'Établir les preuves du collectif au laboratoire');
}
