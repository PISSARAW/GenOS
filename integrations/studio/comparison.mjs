import { byId, node } from './ui.mjs';
import { humanValue } from './records.mjs';

const graders = ['exact_match', 'groundedness', 'safety', 'llm_judge'];

export function comparisonRows(jobs) {
  const rows = [
    ['État observé', job => job.status],
    ['Entrées figées', job => job.inputsHash],
    ['Job source', job => job.sourceJobId],
    ['Cas observés', job => job.metrics?.total],
    ['Cas réussis', job => job.metrics?.passed],
    ['Score global', job => job.metrics?.score],
    ['Garantie de qualité', job => job.qualityGuarantee]
  ];
  for (const grader of graders) {
    if (jobs.some(job => job.metrics?.graderSummary?.[grader])) {
      rows.push([grader + ' · score', job => job.metrics?.graderSummary?.[grader]?.score]);
      rows.push([grader + ' · complet', job => job.metrics?.graderSummary?.[grader]?.complete]);
    }
  }
  return rows.map(([label, read]) => [label, ...jobs.map(job => humanValue(read(job)))]);
}

export function renderComparison(target, data) {
  const container = node('div');
  container.className = 'comparison-scroll';
  container.tabIndex = 0;
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Comparaison des jobs, défilement horizontal');
  const table = node('table');
  table.style.minWidth = Math.max(520, (data.jobs.length + 1) * 180) + 'px';
  table.append(node('caption', 'Mêmes lignes pour chaque job. Inconnu ≠ zéro. Aucune promotion implicite.'));
  const head = node('thead');
  const titles = node('tr');
  for (const label of ['Observation', ...data.jobs.map(job => job.id)]) {
    const heading = node('th', label);
    heading.scope = 'col';
    titles.append(heading);
  }
  head.append(titles);
  const body = node('tbody');
  for (const [label, ...values] of comparisonRows(data.jobs)) {
    const row = node('tr');
    const heading = node('th', label);
    heading.scope = 'row';
    row.append(heading, ...values.map(value => node('td', value)));
    body.append(row);
  }
  table.append(head, body);
  container.append(table);
  byId(target).replaceChildren(container);
}
