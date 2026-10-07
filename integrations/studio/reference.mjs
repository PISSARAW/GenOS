import { api } from './app.mjs';
import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';

export function startReference() {
  const root = () => '/api/studio/agents/' + encoded(api.session.agent) + '/reference';
  const target = journeyView({ id: 'reference', title: 'Référentiel GenOS',
    intro: 'Retrouver chaque entrée canonique, sa source, son statut et ses limites sans fabriquer une capacité runtime.',
    steps: ['Choisir le registre : canonical (inventaire documenté), runtime (adaptateurs déclarés) ou philosophy (concepts et écoles).',
      'Chercher et parcourir les pages, puis inspecter une fiche. Les axes documentation, maturité, classification et autorité restent distincts.',
      'Tester une formule propositionnelle bornée et conserver son analyse. Une tautologie ne prouve pas les faits externes ni une promotion.'] });
  journeyRead(target, { id: 'reference-list', title: 'Chercher et paginer le registre',
    fields: [['namespace', 'Registre', 'text', true, 'canonical'], ['q', 'Recherche', 'text', false],
      ['domain', 'Domaine (vide pour tous)', 'text', false], ['offset', 'Position de page', 'number', true, '0'],
      ['limit', 'Taille de page (1 à 100)', 'number', true, '50']],
    path: values => root() + '?' + new URLSearchParams(values),
    after: data => {
      const form = target.actions.querySelector('[data-journey-read="reference-inspect"]');
      form.elements.namespace.value = data.namespace;
      if (data.items[0]) form.elements.id.value = data.items[0].id;
    } });
  journeyRead(target, { id: 'reference-inspect', title: 'Inspecter fiche, contrat et relations',
    fields: [['namespace', 'Registre de la fiche', 'text', true, 'philosophy'], ['id', 'Identifiant de la fiche', 'text', true, 'logic.propositional']],
    path: values => root() + '/concept?' + new URLSearchParams(values) });
  journeyAction(target, { id: 'reference-logic', title: 'Classifier et conserver une formule', path: () => root() + '/logic',
    fields: [['formula', 'Formule : !, &, |, >, = (8 atomes maximum)', 'text', true, 'A | !A']],
    confirm: 'Conserver une analyse logique classique sans certifier les faits externes, une théorie ou une capacité ?' });
  journeyLink(target, 'organism-view', 'Rejoindre Organisme et ses mécanismes');
  journeyLink(target, 'knowledge-view', 'Inspecter la provenance de l’analyse');
}
