import { encoded } from './ui.mjs';
import { journeyView, journeyRead, journeyAction, journeyLink } from './journeyView.mjs';
import { startCollective } from './collective.mjs';
import { startPerception } from './perception.mjs';

export function startOrganism() {
  const target = journeyView({ id: 'organism', title: 'Organisme et AgentDNA',
    intro: 'Inspecter les sections et les gènes, créer un candidat et préparer la mesure de ses effets.',
    steps: ['Charger les génomes du projet et inspecter sections, gènes, signature et phénotype déclaré.',
      'Fixer une seed et un taux de mutation borné. La version source doit être celle inspectée.',
      'Créer un candidat avec le CLI natif et son événement de filiation. Le candidat n’est ni déployé ni promu ; tester ses effets au laboratoire.'] });
  journeyRead(target, { id: 'organism-list', title: 'Charger les génomes du projet', path: () => '/api/studio/genomes' });
  journeyRead(target, { id: 'organism-inspect', title: 'Inspecter sections et phénotype déclaré',
    fields: [['genomeId', 'Génome']], path: input => '/api/studio/genomes/' + encoded(input.genomeId),
    after: data => {
      const form = target.actions.querySelector('[data-action="organism-mutate"]');
      form.elements.genomeId.value = data.genome.id;
      form.elements.contentHash.value = data.genome.contentHash;
    } });
  journeyAction(target, { id: 'organism-mutate', title: 'Créer une mutation candidate',
    fields: [['genomeId', 'Génome source'], ['contentHash', 'Empreinte de la version source'],
      ['rate', 'Taux de mutation entre 0 et 1', 'number', true, '0.1'], ['seed', 'Seed reproductible', 'text', true, 'studio-dna-1']],
    path: input => '/api/studio/genomes/' + encoded(input.genomeId) + '/mutate',
    body: input => ({ contentHash: input.contentHash, rate: input.rate, seed: input.seed }),
    confirm: 'Créer un nouveau candidat sans modifier la source, déployer un agent ou accorder une promotion ?' });
  journeyLink(target, 'research-view', 'Préparer une expérience et mesurer le candidat');
  startCollective(target);
  startPerception(target);
}
