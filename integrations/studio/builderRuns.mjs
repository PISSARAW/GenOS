import { byId, node } from './ui.mjs';
import { badge, metricTile } from './presentation.mjs';

function elapsed(run) {
  if (!run.started_at || !run.completed_at) return 'Inconnue';
  const start = Date.parse(run.started_at.replace(' ', 'T') + 'Z');
  const end = Date.parse(run.completed_at.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'Inconnue';
  return end - start + ' ms';
}

export function renderWorkflowRuns(runs) {
  const root = byId('builder-runs');
  const metrics = node('div');
  metrics.className = 'metric-grid';
  metrics.append(metricTile('Exécutions observées', runs.length),
    metricTile('Échecs observés', runs.filter(item => item.status === 'failed').length),
    metricTile('Coût USD', 'Inconnu', 'Non instrumenté dans ce parcours'));
  const list = node('ol');
  list.className = 'timeline';
  for (const run of runs.slice(0, 20)) {
    const item = node('li');
    item.dataset.status = run.status;
    item.append(node('strong', 'Version ' + run.workflow_version), badge(run.status),
      node('p', 'Durée entre horodatages persistés : ' + elapsed(run)), node('code', run.id));
    const details = node('details');
    details.append(node('summary', 'Entrée, sortie et erreur de cette exécution'),
      node('pre', JSON.stringify({ input: run.input, output: run.output, error: run.error }, null, 2)));
    item.append(details);
    list.append(item);
  }
  if (!runs.length) list.append(node('li', 'Aucune exécution observée pour ce workflow.'));
  root.replaceChildren(metrics, list);
}
