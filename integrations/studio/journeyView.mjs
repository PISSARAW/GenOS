import { api, perform } from './app.mjs';
import { byId, node } from './ui.mjs';
import { field, actionForm } from './forms.mjs';
import { renderResponse } from './components.mjs';

export function journeyView(spec) {
  const view = node('section');
  view.id = spec.id + '-view';
  view.dataset.view = '';
  view.hidden = true;
  view.className = 'journey-view';
  const header = node('div');
  header.className = 'view-heading';
  const heading = node('div');
  const eyebrow = node('p', 'PARCOURS GENOS');
  eyebrow.className = 'eyebrow';
  const intro = node('p', spec.intro);
  intro.className = 'muted';
  heading.append(eyebrow, node('h2', spec.title), intro);
  header.append(heading);
  const steps = node('ol');
  steps.className = 'panel';
  steps.setAttribute('aria-label', 'Étapes et limites du parcours');
  steps.append(...spec.steps.map(text => node('li', text)));
  const actions = node('section');
  actions.className = 'panel action-list';
  actions.id = spec.id + '-actions';
  actions.append(node('h3', 'Actions explicites'));
  const summary = node('div');
  summary.id = spec.id + '-result-summary';
  summary.dataset.runtime = '';
  const technical = node('details');
  technical.append(node('summary', 'Inspecteur technique — ' + spec.title));
  const output = node('pre');
  output.id = spec.id + '-result';
  output.dataset.runtime = '';
  technical.append(output);
  view.append(header, steps, actions, summary, technical);
  byId('view-content').append(view);
  const button = node('button', spec.title);
  button.type = 'button';
  button.dataset.target = view.id;
  byId('navigation').append(button);
  window.addEventListener('studio:cleared', () => {
    for (const form of view.querySelectorAll('form')) form.reset();
  });
  return { view, actions, output: spec.id + '-result' };
}

export function journeyRead(target, spec) {
  const form = node('form');
  form.className = 'compact-form';
  form.dataset.journeyRead = spec.id;
  for (const item of spec.fields || []) form.append(field(item));
  const button = node('button', spec.title);
  button.type = 'submit';
  button.dataset.permission = 'read';
  form.append(button);
  form.addEventListener('submit', event => {
    event.preventDefault();
    perform(async () => {
      const input = Object.fromEntries(new FormData(form));
      const data = await api.request(spec.path(input), spec.options?.(input));
      renderResponse(target.output, data);
      if (spec.after) await spec.after(data);
    }, { preserveDraft: true });
  });
  target.actions.append(form);
}

export function journeyAction(target, spec) {
  actionForm({ ...spec, output: target.output, after: spec.after || (() => {}) }, target.actions);
}

export function journeyLink(target, view, title) {
  const button = node('button', title);
  button.type = 'button';
  button.addEventListener('click', () => document.querySelector(`[data-target="${view}"]`).click());
  target.actions.append(button);
}
