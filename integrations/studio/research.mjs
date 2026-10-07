import { api, perform } from './app.mjs';
import { byId, encoded, node, options } from './ui.mjs';
import { actionForm } from './forms.mjs';
import { researchActions } from './researchActions.mjs';

async function collections() {
  const [experiments, datasets, campaigns, jobs] = await Promise.all([
    api.request('/api/experiments'), api.request('/api/evals/datasets'),
    api.request('/api/evals/campaigns'), api.request('/api/evals/jobs')]);
  options('experiments', experiments);
  options('datasets', datasets);
  options('campaigns', campaigns);
  options('jobs', jobs);
  byId('research-data').textContent = JSON.stringify({ experiments, datasets, campaigns, jobs }, null, 2);
}

async function inspect() {
  const id = byId('experiment-choice').value;
  const data = await api.request('/api/experiments/' + encoded(id) + '/evidence-ledger');
  byId('research-data').textContent = JSON.stringify(data, null, 2);
  options('claims', data.claims.map(claim => ({ id: claim.claimId, name: claim.statement })));
  byId('research-claims').replaceChildren(...data.claims.map(claim => node('li',
    `${claim.statement} · ${claim.status.position} · vérification : ${claim.status.verifierStatus} · promotion non accordée`)));
}

async function inspectJob() {
  const job = await api.request('/api/evals/jobs/' + encoded(byId('job-choice').value));
  byId('research-data').textContent = JSON.stringify(job, null, 2);
}

export function startResearch() {
  for (const spec of researchActions) actionForm(spec, byId('research-actions'));
  byId('research-refresh').addEventListener('click', () => perform(collections));
  byId('research-inspect').addEventListener('click', () => perform(inspect));
  byId('job-inspect').addEventListener('click', () => perform(inspectJob));
  byId('dataset-inspect').addEventListener('click', () => perform(async () => {
    byId('research-data').textContent = JSON.stringify(await api.request('/api/evals/datasets/' + encoded(byId('dataset-choice').value) + '/cases'), null, 2);
  }));
  byId('jobs-compare').addEventListener('click', () => perform(async () => {
    const ids = byId('job-comparison').value.split(',').map(value => value.trim()).join(',');
    byId('research-data').textContent = JSON.stringify(await api.request('/api/evals/compare?ids=' + encoded(ids)), null, 2);
  }));
  for (const [id, path] of [['arena-results', '/api/arena/tournament'], ['arena-pareto', '/api/arena/pareto'], ['arena-trace', '/api/arena/trace']]) {
    byId(id).addEventListener('click', () => perform(async () => {
      byId('research-data').textContent = JSON.stringify(await api.request(path), null, 2);
    }));
  }
  window.addEventListener('studio:cleared', () => {
    for (const id of ['experiment-choice', 'claim-choice', 'dataset-choice', 'campaign-choice', 'job-choice', 'job-comparison']) byId(id).value = '';
  });
}
