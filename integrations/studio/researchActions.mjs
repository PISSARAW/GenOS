import { api } from './app.mjs';
import { byId, encoded } from './ui.mjs';

const selected = id => encoded(byId(id).value);
const experiment = () => '/api/experiments/' + selected('experiment-choice');
const ledger = () => experiment() + '/evidence-ledger';
const json = (input, name, fallback) => input[name] ? JSON.parse(input[name]) : fallback;
const text = (name, label, initial = '') => [name, label, 'textarea', true, initial];

export const researchActions = [
  { id: 'protocol-register', title: 'Enregistrer un protocole', path: () => '/api/experiments/register-protocol',
    fields: [['title', 'Titre'], ['seed', 'Seed entier', 'number', true, '1'],
      text('protocol', 'Question et falsification JSON', '{"question":"","falsification":""}'),
      text('inputs', 'Entrées JSON', '{}'), text('budget', 'Budget déclaré JSON', '{"tokens":10000,"costUsd":1,"durationMs":30000,"maxTrials":1}'),
      text('environment', 'Environnement JSON', '{}')],
    body: input => ({ title: input.title, seed: input.seed, workspaceId: byId('workspace-choice').value,
      protocol: json(input, 'protocol'), inputs: json(input, 'inputs'), budget: json(input, 'budget'),
      environment: json(input, 'environment'), proofLevel: 'L1' }),
    after: response => { byId('experiment-choice').value = response.experimentId; } },
  { id: 'protocol-replay', title: 'Rejouer les entrées du protocole', path: () => experiment() + '/replay-inputs', fields: [],
    confirm: 'Créer une nouvelle expérience avec les entrées figées ? Aucun essai ne sera automatiquement exécuté.',
    after: response => { byId('experiment-choice').value = response.experimentId; } },
  { id: 'experiment-status', title: 'Consigner l’état de l’expérience', path: () => experiment() + '/status',
    fields: [['status', 'État : Running, Analyzed ou Failed'], text('resultsSummary', 'Résumé JSON', '{}')],
    body: input => ({ status: input.status, resultsSummary: json(input, 'resultsSummary') }) },
  { id: 'claim-create', title: 'Enregistrer une hypothèse', path: () => ledger() + '/claims', method: 'POST',
    fields: [text('statement', 'Hypothèse falsifiable'), text('scope', 'Portée JSON', '{}'), text('assumptions', 'Hypothèses de travail JSON', '[]')],
    body: input => ({ statement: input.statement, scope: json(input, 'scope'), assumptions: json(input, 'assumptions') }) },
  { id: 'evidence-create', title: 'Attacher une preuve ou contradiction',
    path: () => ledger() + '/claims/' + selected('claim-choice') + '/evidence',
    fields: [['relation', 'Relation : SUPPORTS, CONTRADICTS ou QUALIFIES'], ['sourceKind', 'Type de source'],
      ['sourceId', 'Référence de source'], text('evidence', 'Observation JSON', '{}')], body: input => ({ ...input, evidence: json(input, 'evidence') }) },
  { id: 'assessment-create', title: 'Consigner une revue non certifiante',
    path: () => ledger() + '/claims/' + selected('claim-choice') + '/assessments',
    fields: [['position', 'Position : support, reject ou abstain'], text('rationale', 'Justification'),
      text('evidenceRefs', 'Références de preuves JSON', '[]')],
    body: input => ({ kind: 'consensus', position: input.position, rationale: input.rationale, evidenceRefs: json(input, 'evidenceRefs') }) },
  { id: 'dataset-create', title: 'Créer un dataset', permission: 'workspace:write', path: () => '/api/evals/datasets',
    fields: [['name', 'Nom'], ['description', 'Description', 'textarea', false]],
    after: response => { byId('dataset-choice').value = response.id; } },
  { id: 'case-create', title: 'Ajouter un cas au dataset', permission: 'workspace:write',
    path: () => '/api/evals/datasets/' + selected('dataset-choice') + '/cases',
    fields: [text('input', 'Entrée JSON', '{"output":""}'), text('expected', 'Sortie attendue JSON', '""'), text('labels', 'Labels JSON', '[]')],
    body: input => ({ input: json(input, 'input'), expected: json(input, 'expected'), labels: json(input, 'labels') }) },
  { id: 'campaign-create', title: 'Créer une campagne', path: () => '/api/evals/campaigns',
    fields: [['name', 'Nom'], ['seed', 'Seed', 'number', true, '1'], text('config', 'Configuration JSON', '{}')],
    body: input => ({ ...input, config: json(input, 'config') }),
    after: response => { byId('campaign-choice').value = response.id; } },
  { id: 'job-create', title: 'Mettre une évaluation en file', permission: 'experiment:run', path: () => '/api/evals/jobs',
    fields: [text('config', 'Configuration, graders et seed JSON', '{"graders":["exact_match"],"seed":1}')],
    body: input => ({ datasetId: byId('dataset-choice').value, campaignId: byId('campaign-choice').value || null, config: json(input, 'config') }),
    after: response => { byId('job-choice').value = response.id; } },
  { id: 'job-cancel', title: 'Annuler l’évaluation', permission: 'experiment:run',
    path: () => '/api/evals/jobs/' + selected('job-choice') + '/cancel', fields: [],
    confirm: 'Annuler ce job ? Le worker vérifie l’annulation entre les cas ; une requête fournisseur en cours peut se terminer.' },
  { id: 'job-replay', title: 'Rejouer les entrées figées du job', permission: 'experiment:run',
    path: () => '/api/evals/jobs/' + selected('job-choice') + '/replay', fields: [],
    confirm: 'Créer un nouveau job avec la configuration et les entrées originales ? Un modèle peut retourner un résultat différent.',
    after: response => { byId('job-choice').value = response.id; } },
  { id: 'arena-run', title: 'Exécuter le benchmark local', permission: 'experiment:run', path: () => '/api/arena/run',
    fields: [text('problemSpec', 'Cas de recherche triée JSON', '{"title":"Local","cases":[{"values":[1,2,3],"target":2}]}'),
      text('solvers', 'Solveurs JSON', '["beam_solver","react_solver"]'), ['rounds', 'Répétitions (1–100)', 'number', true, '3']],
    body: input => ({ ...input, problemSpec: json(input, 'problemSpec'), solvers: json(input, 'solvers') }) }
].map(spec => ({ permission: 'experiment:write', output: 'research-result', ...spec }));
