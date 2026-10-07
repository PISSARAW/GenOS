import { api } from './app.mjs';
import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';

export function startHealth(parent) {
  const root = () => '/api/studio/agents/' + encoded(api.session.agent) + '/health';
  const target = journeyView({ id: 'health', title: 'Immunité et nosologie', parent,
    intro: 'Inspecter les modèles agentiques et la provenance AEIS, puis qualifier une anomalie sans thérapie automatique.',
    steps: ['Lire l’état clinique persisté, les événements et les assemblages AEIS liés au run avec leur validité actuelle. Aucun état absent n’est initialisé ici.',
      'Scanner les seuils du modèle, collecter une biopsie puis classifier le cas : le score n’est pas un diagnostic causal ni une recommandation médicale humaine.',
      'Conserver la provenance et rejoindre la reprise. Les traitements et quarantaines exigent leurs autorités propres et ne sont pas appliqués ici.'] });
  journeyRead(target, { id: 'health-inspect', title: 'Inspecter état, catalogue et preuves AEIS', path: root });
  journeyAction(target, { id: 'health-scan', title: 'Scanner les seuils de l’état persisté', path: () => root() + '/scan', fields: [],
    confirm: 'Consigner une surveillance sans initialiser les valeurs manquantes, appliquer une quarantaine ou une thérapie ?' });
  journeyAction(target, { id: 'health-biopsy', title: 'Collecter une biopsie du modèle', path: () => root() + '/biopsy',
    fields: [['pathologyType', 'Pathologie runtime', 'text', true, 'mutation_drift']],
    after: result => { target.actions.querySelector('[data-action="health-diagnose"]').elements.biopsyRef.value = result.biopsyRef; },
    confirm: 'Conserver les marqueurs et leur source dans une biopsie, sans traitement ?' });
  journeyAction(target, { id: 'health-diagnose', title: 'Classifier la biopsie', path: () => root() + '/diagnose',
    fields: [['biopsyRef', 'Identifiant de biopsie de cet agent']],
    confirm: 'Consigner la classification par seuils sans l’assimiler à une cause établie ou appliquer une thérapie ?' });
  journeyAction(target, { id: 'health-threats', title: 'Scanner les signatures heuristiques d’un texte', path: () => root() + '/threats',
    fields: [['text', 'Texte à analyser — ne pas coller de secrets', 'textarea']],
    confirm: 'Consigner signatures et empreinte uniquement ? Aucune signature trouvée ne prouve pas la sécurité.' });
  journeyLink(target, 'recovery-view', 'Retour à Diagnostic et reprise');
  journeyLink(target, 'knowledge-view', 'Inspecter la provenance des analyses');
}
