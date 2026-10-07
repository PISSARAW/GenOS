import { api } from './app.mjs';
import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';

export function startPerception(parent) {
  const root = () => '/api/studio/agents/' + encoded(api.session.agent) + '/perception';
  const target = journeyView({ id: 'perception', title: 'Perception et cognition', parent,
    intro: 'Planifier une observation, sonder un fichier autorisé et inspecter les reçus cognitifs existants.',
    steps: ['Consulter les capteurs déclarés et les reçus persistés. Absence de reçus signifie non exécuté.',
      'Planifier sous budget sans confondre capteur du catalogue et outil disponible ou autorisé.',
      'Observer un fichier texte confiné : seule sa version et ses métadonnées sont conservées. Aucun gain cognitif, causalité ou conscience subjective n’est établi.'] });
  journeyRead(target, { id: 'perception-inspect', title: 'Inspecter capteurs et reçus cognitifs', path: root });
  journeyAction(target, { id: 'perception-plan', title: 'Planifier et conserver les probes', path: () => root() + '/plan',
    fields: [['topic', 'Inconnue à explorer', 'text', true, 'structure du code'], ['budget', 'Budget du plan (0 à 10)', 'number', true, '3']],
    confirm: 'Conserver ce plan sans exécuter les probes proposées ?' });
  journeyAction(target, { id: 'perception-probe', title: 'Observer et conserver les métadonnées d’un fichier', path: () => root() + '/probe',
    fields: [['path', 'Chemin relatif du fichier texte']],
    confirm: 'Lire ce fichier autorisé et conserver sa version sans stocker son contenu dans la mémoire ?' });
  journeyLink(target, 'organism-view', 'Retour à Organisme et AgentDNA');
  journeyLink(target, 'knowledge-view', 'Inspecter les analyses conservées en mémoire');
}
