import { api } from './app.mjs';
import { encoded } from './ui.mjs';
import { journeyView, journeyAction, journeyLink } from './journeyView.mjs';

export function startBiomimetic(parent) {
  const root = () => '/api/studio/agents/' + encoded(api.session.agent) + '/biomimetic';
  const target = journeyView({ id: 'biomimetic', title: 'Créativité et biophysique', parent,
    intro: 'Préparer des variations de représentation et comparer des calculs locaux avant une expérience.',
    steps: ['Déclarer les entrées : historique d’erreur, représentation ou paramètres du modèle.',
      'Calculer curiosité/progrès, enrichissement de prompt NCE ou atténuation Rall et spike NMDA avec les moteurs existants.',
      'Conserver une analyse provisoire et préparer une mesure au laboratoire. Aucun modèle, worker ou hôte n’est modifié.'] });
  journeyAction(target, { id: 'biomimetic-creative', title: 'Calculer curiosité et représentation NCE', path: () => root() + '/creative',
    fields: [['prompt', 'Prompt source', 'textarea', true, 'Comparer deux approches de résolution.'],
      ['representation', 'Représentation alternative déclarée', 'textarea', true, 'Représenter le problème comme un graphe de contraintes.'],
      ['domainRecord', 'Historique déclaré JSON', 'textarea', true, '{"seenCount":2,"errorHistory":[0.9,0.7,0.4]}']],
    confirm: 'Conserver ce calcul et le prompt enrichi sans appeler un modèle ni valider leur efficacité ?' });
  journeyAction(target, { id: 'biomimetic-physics', title: 'Calculer atténuation et spike', path: () => root() + '/physics',
    fields: [['voltage', 'Amplitude initiale (0 à 100)', 'number', true, '2'], ['distance', 'Distance électrotonique (0 à 100)', 'number', true, '1'],
      ['lambda', 'Constante spatiale (0,001 à 100)', 'number', true, '1'], ['density', 'Densité NMDA (0,001 à 100)', 'number', true, '1'],
      ['threshold', 'Seuil du modèle (0,001 à 100)', 'number', true, '1.2']],
    confirm: 'Conserver les résultats du modèle biophysique sans réguler l’hôte ou modifier un organisme ?' });
  journeyLink(target, 'organism-view', 'Retour à Organisme et AgentDNA');
  journeyLink(target, 'research-view', 'Comparer les effets dans une expérience');
}
